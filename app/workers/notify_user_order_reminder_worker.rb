#Commit 14

# app/workers/notify_user_order_reminder_worker.rb
# frozen_string_literal: true

# Ce worker envoie un rappel aux utilisateurs 7 jours avant la date de retour prévue
class NotifyUserOrderReminderWorker
  include Sidekiq::Worker
  sidekiq_options queue: :default

  def perform(order_id = nil)
    if order_id
      # Mode singulier: rappel immédiat pour une commande spécifique
      order = Order.find_by(id: order_id)
      send_reminder(order) if order&.in_progress?
    else
      # Mode groupé: rappel pour toutes les commandes dont la date de retour est dans 7 jours
      date_in_7_days = Date.today + 7.days
      
      Order.where(state: 'in_progress').find_each do |order|
        if order.expected_return_date && order.expected_return_date.to_date == date_in_7_days
          send_reminder(order)
          Rails.logger.info "Envoi d'un rappel pour la commande #{order.id} à #{order.statistic_profile.user.email} (retour prévu dans 7 jours)"
        end
      end
    end
  end

  private

  def send_reminder(order)
    NotificationsMailer.notify_user_order_reminder(order).deliver_later
  rescue StandardError => e
    Rails.logger.error "[NotifyUserOrderReminderWorker] Erreur : #{e.message}"
  end
end