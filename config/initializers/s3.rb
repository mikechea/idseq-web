S3_CLIENT = Aws::S3::Client.new
S3_PRESIGNER = Aws::S3::Presigner.new(client: S3_CLIENT) # auth from the env
SAMPLES_BUCKET_NAME = ENV['SAMPLES_BUCKET_NAME']
SAMPLE_DOWNLOAD_EXPIRATION = 3600 # seconds
S3_GLOBAL_ENDPOINT = "https://s3.amazonaws.com".freeze
S3_DATABASE_BUCKET = ENV["S3_DATABASE_BUCKET"]
S3_AEGEA_ECS_EXECUTE_BUCKET = ENV["S3_AEGEA_ECS_EXECUTE_BUCKET"] || "aegea-ecs-execute-#{Rails.env}"