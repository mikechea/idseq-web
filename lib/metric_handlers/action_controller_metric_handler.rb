require_relative 'base'
require './lib/cloudwatch_util'

module MetricHandlers
  class ActionControllerMetricHandler < Base
    def process_event
      event_log = {
        type: "metric",
        source: "backend",
        msg: "process_action.action_controller",
        v: 1,
        details: {
          controller: @event.payload[:controller],
          action: @event.payload[:action],
          method: @event.payload[:method],
          params: @event.payload[:params],
          path: @event.payload[:path],
          request: @event.payload[:request],
          status: @event.payload[:status],
          location: @event.payload[:location],
          db_runtime: @event.payload[:db_runtime],
          event_duration: @event.duration, # in milliseconds
        },
      }

      # Format of event.payload[:exception]: ["exception name", "exception message"]
      if @event.payload[:exception].present?
        event_log[:details][:exception] = {
          name: @event.payload[:exception][0],
          message: @event.payload[:exception][1],
        }
        process_exception_metric
      else
        process_metric
      end
    ensure
      @logger.info(event_log)
    end

    def process_metric
      extra_dimensions = Set["domain", "format"]
      clean_path = "/#{@event.payload[:params]['controller']}/#{@event.payload[:params]['action']}"
      metric_data = []
      common_dimensions = [
        { name: "Controller", value: @event.payload[:controller] },
        { name: "Path", value: clean_path },
        { name: "Method", value: @event.payload[:method] },
        { name: "Action", value: @event.payload[:params]["action"] },
      ]

      if @event.payload[:status].present?
        metric_data << CloudWatchUtil.create_metric_datum("Request Status", 1.0, "Count",
                                                          [
                                                            { name: "Status", value: @event.payload[:status].to_s },
                                                            { name: "Path", value: clean_path },
                                                          ])
      end
      metric_data << CloudWatchUtil.create_metric_datum("Duration", @event.duration, "Milliseconds", common_dimensions.dup) if @event.duration.present?
      metric_data << CloudWatchUtil.create_metric_datum("DB Runtime", @event.payload[:db_runtime], "Milliseconds", common_dimensions.dup) if @event.payload[:db_runtime].present?

      extra_dimensions.each do |dim|
        if @event.payload[:params][dim].present?
          metric_data.map do |metric|
            metric[:dimensions] << { name: dim.titleize, value: @event.payload[:params][dim] }
          end
        end
      end

      # Send a metric with a domain and without a domain for querying purposes
      if @event.payload[:params]["domain"].present?
        CloudWatchUtil.put_metric_data("#{Rails.env}-web-action_controller-domain", metric_data)
        metric_data.map do |metric|
          metric[:dimensions].delete_if { |dim| dim.value?("Domain") }
        end
      end

      CloudWatchUtil.put_metric_data("#{Rails.env}-web-action_controller-domain", metric_data)
    end

    def process_exception_metric
      clean_path = "/#{@event.payload[:params]['controller']}/#{@event.payload[:params]['action']}"

      metric_data = [
        CloudWatchUtil.create_metric_datum("Exception Occurences", 1.0, "Count", [
                                             { name: "Path", value: clean_path },
                                             { name: "Exception Name", value: @event.payload[:exception][0] },
                                           ]),
      ]

      metric_data.map do |metric|
        metric[:dimensions] << { name: "Domain", value: @event.payload[:params]["domain"] } if @event.payload[:params]["domain"].present?
        metric[:dimensions] << { name: "Status", value: @event.payload[:params]["status"].to_s } if @event.payload[:params]["status"].present?
      end
      CloudWatchUtil.put_metric_data("#{Rails.env}-web-action_controller-exceptions", metric_data)
    end
  end
end
