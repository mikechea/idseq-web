require 'rails_helper'

RSpec.describe SnapshotSamplesController, type: :controller do
  before do
    user = create(:user)
    @project = create(:project, users: [user])
    @sample_one = create(:sample,
                         project: @project,
                         pipeline_runs_data: [{ finalized: 1, job_status: PipelineRun::STATUS_CHECKED }])
  end

  context "view-only sharing disabled" do
    before do
      AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "0")
    end

    describe "GET #show" do
      it "should redirect to root_path" do
        get :show, params: { id: @sample_one.id, share_id: "test_id" }
        expect(response).to redirect_to(root_path)
      end
    end

    describe "GET #report_v2" do
      it "should redirect to root_path" do
        get :report_v2, params: { id: @sample_one.id, share_id: "test_id" }
        expect(response).to redirect_to(root_path)
      end
    end
  end

  context "view-only sharing enabled" do
    before do
      AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
      @sample_two = create(:sample,
                           project: @project,
                           pipeline_runs_data: [{ finalized: 1, job_status: PipelineRun::STATUS_CHECKED }])
      @snapshot_link = create(:snapshot_link,
                              project_id: @project.id,
                              share_id: "test_id",
                              content: { samples: [{ @sample_one.id => { pipeline_run_id: @sample_one.first_pipeline_run.id } }] }.to_json)
      @public_background = create(:background, name: "Public Background", public_access: 1, pipeline_run_ids: [
                                    @sample_one.first_pipeline_run.id,
                                    @sample_two.first_pipeline_run.id,
                                  ])
    end

    describe "GET #show" do
      it "should redirect to root_path for invalid share_id" do
        get :show, params: { id: @sample_one.id, share_id: "invalid_id" }
        expect(response).to redirect_to(root_path)
      end

      it "should redirect to root_path for non-snapshot sample" do
        get :show, params: { id: @sample_two.id, share_id: "test_id" }
        expect(response).to redirect_to(root_path)
      end

      it "should return the correct sample for valid share_id and sample" do
        get :show, params: { format: "json", id: @sample_one.id, share_id: "test_id" }
        expect(response).to have_http_status(:success)

        json_response = JSON.parse(response.body)
        expect(json_response).not_to eq(nil)
        expect(json_response["name"]).to include(@sample_one.name)
        expect(json_response["default_pipeline_run_id"]).to eq(@sample_one.first_pipeline_run.id)
        expect(json_response["default_background_id"]).to eq(@public_background.id)
      end
    end

    describe "GET #report_v2" do
      it "should redirect to root_path for invalid share_id" do
        get :report_v2, params: { id: @sample_one.id, share_id: "invalid_id" }
        expect(response).to redirect_to(root_path)
      end

      it "should redirect to root_path for non-snapshot sample" do
        get :report_v2, params: { id: @sample_two.id, share_id: "test_id" }
        expect(response).to redirect_to(root_path)
      end

      it "should return the correct report_v2 for valid share_id and sample" do
        get :report_v2, params: { id: @sample_one.id, share_id: "test_id" }
        expect(response).to have_http_status(:success)

        json_response = JSON.parse(response.body)
        expect(json_response).not_to eq(nil)
        expect(json_response["metadata"]["hasErrors"]).to eq(false)
      end
    end
  end
end