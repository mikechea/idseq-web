class AddCarpHost < ActiveRecord::Migration[5.1]
  def up
    return if HostGenome.find_by(name: "Carp")

    hg = HostGenome.new
    hg.name = "Carp"
    hg.s3_star_index_path = "s3://idseq-database/host_filter/carp/2019-04-17/STAR_genome.tar"
    hg.s3_bowtie2_index_path = "s3://idseq-database/host_filter/carp/2019-04-17/bowtie2_genome.tar"

    human_host = HostGenome.find_by(name: "Human")
    # For lack of a better default, use Human background.
    # In the future, consider asking carp users to make a background model
    # from their uninfected samples that we can substitute as the default.
    hg.default_background_id = human_host.default_background_id if human_host
    hg.save
  end

  def down
    hg = HostGenome.find_by(name: "Carp")
    hg.destroy if hg
  end
end
