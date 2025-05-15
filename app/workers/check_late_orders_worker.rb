# frozen_string_literal: true

# This worker periodically checks in-progress orders to mark them as late if needed
class CheckLateOrdersWorker
  include Sidekiq::Worker
  sidekiq_options queue: :default

  def perform
    # Find all orders that are in_progress and might be late
    Order.where(state: 'in_progress').find_each do |order|
      # Check and update status according to return date
      order.check_and_set_late!
    end
  end
end 