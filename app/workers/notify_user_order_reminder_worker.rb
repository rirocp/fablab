#Commit 14

# app/workers/notify_user_order_reminder_worker.rb
# frozen_string_literal: true

class NotifyUserOrderReminderWorker
  include Sidekiq::Worker
  sidekiq_options queue: :default

  def perform(order_id)
    order = Order.find_by(id: order_id)
    return unless order&.in_progress?

    NotificationsMailer.notify_user_order_reminder(order).deliver_now
  rescue StandardError => e
    Rails.logger.error "[NotifyUserOrderReminderWorker] Erreur : #{e.message}"
  end
end