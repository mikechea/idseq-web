require 'rails_helper'

RSpec.describe SnapshotLinksController, type: :controller do
  before do
    @user = create(:user)
    @unauthorized_user = create(:user)
  end

  context "when the user is logged in" do
    before do
      @project = create(:project, users: [@user])
      @sample = create(:sample,
                       project: @project,
                       pipeline_runs_data: [{ finalized: 1, job_status: PipelineRun::STATUS_CHECKED }])
    end

    describe "POST #create" do
      it "should create a new snapshot link, if the feature is enabled" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        @user.add_allowed_feature("edit_snapshot_links")
        sign_in @user

        existing_share_ids = SnapshotLink.all.pluck(:share_id).to_set
        expect do
          post :create, params: { project_id: @project.id }
        end.to change(SnapshotLink, :count).by(1)

        new_snapshot = SnapshotLink.last
        expect(new_snapshot["project_id"]).to eq(@project.id)
        expect(new_snapshot["creator_id"]).to eq(@user.id)
        expect(new_snapshot["created_at"]).not_to eq(nil)

        # check for expected snapshot share_id
        share_id = new_snapshot["share_id"]
        expect(existing_share_ids.exclude?(share_id)).to be(true)
        expect(share_id.count("^a-zA-Z0-9")).to eq(0)
        expect(share_id.count("ilI1oO0B8S5Z2G6")).to eq(0)
        expect(share_id.length).to eq(20)

        # check for expected snapshot content
        expected_content = { "samples" =>
          [{ @sample.id.to_s => { "pipeline_run_id" => @sample.first_pipeline_run.id } }], }
        content = JSON.parse(new_snapshot["content"])
        expect(content).to eq(expected_content)

        # check for expected json_response
        expect(response).to have_http_status(:ok)
        json_response = JSON.parse(response.body)
        expect(json_response["share_id"]).to eq(share_id)
        expect(json_response["created_at"]).to eq(new_snapshot.created_at.to_s)
      end

      it "should redirect to root path, if the feature is disabled" do
        sign_in @user
        post :create, params: { project_id: @project.id }
        expect(response).to redirect_to root_path
      end

      it "should return unauthorized if user doesn't have edit access to the project" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        @unauthorized_user.add_allowed_feature("edit_snapshot_links")
        sign_in @unauthorized_user

        post :create, params: { project_id: @project.id }
        expect(response).to have_http_status(:unauthorized)
      end
    end

    describe "DELETE #destroy" do
      before do
        @snapshot_link = create(:snapshot_link,
                                project_id: @project.id,
                                share_id: "test_id",
                                content: { samples: [{ @sample.id => { pipeline_run_id: @sample.first_pipeline_run.id } }] }.to_json)
      end

      it "should destroy the specified snapshot, if snapshot sharing and the feature is enabled" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        @user.add_allowed_feature("edit_snapshot_links")
        sign_in @user

        expect do
          delete :destroy, params: { share_id: @snapshot_link.share_id }
        end.to change(SnapshotLink, :count).by(-1)
      end

      it "should redirect to root path, if the share_id is invalid" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        @user.add_allowed_feature("edit_snapshot_links")
        sign_in @user

        delete :destroy, params: { share_id: "invalid_id" }
        expect(response).to redirect_to root_path
      end

      it "should redirect to root path, if the snapshot sharing is disabled" do
        @user.add_allowed_feature("edit_snapshot_links")
        sign_in @user

        delete :destroy, params: { share_id: @snapshot_link.share_id }
        expect(response).to redirect_to root_path
      end

      it "should redirect to root path, if the feature is disabled" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        sign_in @user

        delete :destroy, params: { share_id: @snapshot_link.share_id }
        expect(response).to redirect_to root_path
      end

      it "should return unauthorized if user doesn't have edit access to the project" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        @unauthorized_user.add_allowed_feature("edit_snapshot_links")
        sign_in @unauthorized_user

        delete :destroy, params: { share_id: @snapshot_link.share_id }
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  context "when the user is logged out" do
    before do
      project = create(:project, users: [@user])
      sample = create(:sample,
                      project: project,
                      pipeline_runs_data: [{ finalized: 1, job_status: PipelineRun::STATUS_CHECKED }])
      @snapshot_link = create(:snapshot_link,
                              project_id: project.id,
                              share_id: "test_id",
                              content: { samples: [{ sample.id => { pipeline_run_id: sample.first_pipeline_run.id } }] }.to_json)
    end

    describe "GET #show" do
      it "should redirect to root path, if snapshot sharing is disabled" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "0")
        get :show, params: { share_id: @snapshot_link.share_id }
        expect(response).to redirect_to root_path
      end

      it "should render the snapshot template, if snapshot sharing is enabled" do
        AppConfigHelper.set_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING, "1")
        get :show, params: { share_id: @snapshot_link.share_id }
        expect(response).to render_template("home/snapshot")
      end
    end
  end
end
