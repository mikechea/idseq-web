class SfnPipelineDispatchService
  # This service is responsible for dispatching a request to the
  # StepFunctions-based pipeline.
  # It generates jsons for all the pipeline run stages, converts them to WDL,
  # creates the Step Function's input JSON and start SFN execution

  include Callable

  STS_CLIENT = Aws::STS::Client.new
  SFN_CLIENT = Aws::States::Client.new

  # Constains SFN deployment stage names that differ from Rails.env
  ENV_TO_DEPLOYMENT_STAGE_NAMES = {
    "development" => "dev",
    "staging" => "staging",
    "prod" => "prod",
  }.freeze

  class SfnArnMissingError < StandardError
    def initialize
      super("SFN ARN not set on App Config")
    end
  end

  class SfnVersionTagsMissingError < StandardError
    def initialize(arn, tags)
      super("WDL version not set for SFN '#{arn}'. Tags missing: #{tags}")
    end
  end

  class Idd2WdlError < StandardError
    def initialize(error)
      super("Command to convert dag to wdl failed ('idd2wdl.py'). Error: #{error}")
    end
  end

  def initialize(pipeline_run)
    @pipeline_run = pipeline_run
    @sample = pipeline_run.sample
    @docker_image_id = retrieve_docker_image_id

    @sfn_arn = AppConfigHelper.get_app_config(AppConfig::SFN_ARN)
    raise SfnArnMissingError if @sfn_arn.blank?
  end

  def call
    @sfn_tags = retrieve_version_tags
    @pipeline_run.update(pipeline_version: @sfn_tags[:dag_version], wdl_version: @sfn_tags[:wdl_version])

    sfn_input_json = generate_wdl_input
    sfn_execution_arn = dispatch(sfn_input_json)
    return {
      pipeline_version: @sfn_tags[:dag_version],
      sfn_input_json: sfn_input_json,
      sfn_execution_arn: sfn_execution_arn,
    }
  end

  private

  def retrieve_docker_image_id
    resp = STS_CLIENT.get_caller_identity
    return "#{resp[:account]}.dkr.ecr.us-west-2.amazonaws.com/idseq-workflows"
  end

  def retrieve_version_tags
    cache_key = "#{self.class.name}::#{@sfn_arn}::tags"
    Rails.cache.fetch(cache_key, expires_in: 1.minute) do
      resp = SFN_CLIENT.list_tags_for_resource(resource_arn: @sfn_arn)
      tags = resp.tags.reduce({}) do |h, tag|
        h.update(tag.key => tag.value)
      end.symbolize_keys

      missing_tags = [:wdl_version, :dag_version].select { |tag_name| tags[tag_name].blank? }
      raise SfnVersionTagsMissingError.new(@sfn_arn, missing_tags) if missing_tags.present?
      tags
    end
  end

  def stage_deployment_name
    return ENV_TO_DEPLOYMENT_STAGE_NAMES[Rails.env] || Rails.env
  end

  def generate_wdl_input
    sfn_pipeline_input_json = {
      dag_branch: @pipeline_run.pipeline_branch != "master" ? @pipeline_run.pipeline_branch : nil,
      HOST_FILTER_WDL_URI: "s3://#{S3_WORKFLOWS_BUCKET}/v#{@sfn_tags[:wdl_version]}/main/host_filter.wdl",
      NON_HOST_ALIGNMENT_WDL_URI: "s3://#{S3_WORKFLOWS_BUCKET}/v#{@sfn_tags[:wdl_version]}/main/non_host_alignment.wdl",
      POSTPROCESS_WDL_URI: "s3://#{S3_WORKFLOWS_BUCKET}/v#{@sfn_tags[:wdl_version]}/main/postprocess.wdl",
      EXPERIMENTAL_WDL_URI: "s3://#{S3_WORKFLOWS_BUCKET}/v#{@sfn_tags[:wdl_version]}/main/experimental.wdl",
      Input: {
        HostFilter: {
          fastqs_0: File.join(@sample.sample_input_s3_path, @sample.input_files[0].name),
          fastqs_1: @sample.input_files[1] ? File.join(@sample.sample_input_s3_path, @sample.input_files[1].name) : nil,
          file_ext: @sample.fasta_input? ? 'fasta' : 'fastq',
          nucleotide_type: @sample.metadata.find_by(key: "nucleotide_type")&.string_validated_value || '',
          host_genome: @sample.host_genome_name.downcase,
          adapter_fasta: PipelineRun::ADAPTER_SEQUENCES[@sample.input_files[1] ? "paired-end" : "single-end"],
          star_genome: @sample.host_genome.s3_star_index_path,
          bowtie2_genome: @sample.host_genome.s3_bowtie2_index_path,
          human_star_genome: HostGenome.find_by(name: "Human").s3_star_index_path,
          human_bowtie2_genome: HostGenome.find_by(name: "Human").s3_bowtie2_index_path,
          max_input_fragments: @pipeline_run.max_input_fragments,
          max_subsample_fragments: @pipeline_run.subsample,
        }, NonHostAlignment: {
          lineage_db: @pipeline_run.alignment_config.s3_lineage_path,
          accession2taxid_db: @pipeline_run.alignment_config.s3_accession2taxid_path,
          taxon_blacklist: @pipeline_run.alignment_config.s3_taxon_blacklist_path,
          index_dir_suffix: @pipeline_run.alignment_config.index_dir_suffix,
          use_deuterostome_filter: @sample.skip_deutero_filter_flag == 1 ? false : true,
          deuterostome_db: @pipeline_run.alignment_config.s3_deuterostome_db_path,
          use_taxon_whitelist: @pipeline_run.use_taxon_whitelist,
        }, Postprocess: {
          nt_db: @pipeline_run.alignment_config.s3_nt_db_path,
          nt_loc_db: @pipeline_run.alignment_config.s3_nt_loc_db_path,
          nr_db: @pipeline_run.alignment_config.s3_nr_db_path,
          nr_loc_db: @pipeline_run.alignment_config.s3_nr_loc_db_path,
          lineage_db: @pipeline_run.alignment_config.s3_lineage_path,
          taxon_blacklist: @pipeline_run.alignment_config.s3_taxon_blacklist_path,
          use_deuterostome_filter: @sample.skip_deutero_filter_flag == 1 ? false : true,
          deuterostome_db: @pipeline_run.alignment_config.s3_deuterostome_db_path,
          use_taxon_whitelist: @pipeline_run.use_taxon_whitelist,
        }, Experimental: {
          nt_db: @pipeline_run.alignment_config.s3_nt_db_path,
          nt_loc_db: @pipeline_run.alignment_config.s3_nt_loc_db_path,
          file_ext: @sample.fasta_input? ? 'fasta' : 'fastq',
          nt_info_db: @pipeline_run.alignment_config.s3_nt_info_db_path || PipelineRunStage::DEFAULT_S3_NT_INFO_DB_PATH,
          use_taxon_whitelist: @pipeline_run.use_taxon_whitelist,
        },
      },
      OutputPrefix: @sample.sample_output_s3_path,
    }
    return sfn_pipeline_input_json
  end

  def dispatch(sfn_input_json)
    sfn_name = "idseq-#{Rails.env}-#{@sample.project_id}-#{@sample.id}-#{@pipeline_run.id}-#{Time.zone.now.strftime('%Y%m%d%H%M%S')}"
    sfn_input = JSON.dump(sfn_input_json)

    resp = SFN_CLIENT.start_execution(state_machine_arn: @sfn_arn,
                                      name: sfn_name,
                                      input: sfn_input)
    return resp[:execution_arn]
  end
end
