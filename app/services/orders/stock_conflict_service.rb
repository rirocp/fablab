# frozen_string_literal: true

# This service handles stock conflicts between orders
# When an order moves from 'paid' to 'in_progress' and the product stock becomes 0,
# other 'paid' orders containing the same products will be automatically canceled
module Orders
  class StockConflictService
    # Check for stock conflicts and cancel affected orders
    # @param order [Order] the order that has been updated to 'in_progress'
    def self.handle_conflicts(order)
      Rails.logger.info "[StockConflictService] Checking conflicts for order #{order.id}, state: #{order.state}"
      return unless order.state == 'in_progress'

      # Process each product in the order
      order.order_items.each do |item|
        next unless item.orderable_type == 'Product'
        
        product = Product.find_by(id: item.orderable_id)
        next unless product
        
        Rails.logger.info "[StockConflictService] Product #{product.id} - #{product.name} - Stock: #{product.stock.inspect}"
        
        # Only process products with zero stock
        next unless product.stock && product.stock['external'] == 0
        
        Rails.logger.info "[StockConflictService] Product #{product.id} has zero stock, looking for conflicting orders"
        
        # Find other paid orders with the same product
        conflicting_orders = Order.where(state: 'paid')
                                .where.not(id: order.id)
                                .joins(:order_items)
                                .where(order_items: { orderable_type: 'Product', orderable_id: product.id })
                                .distinct
        
        Rails.logger.info "[StockConflictService] Found #{conflicting_orders.count} conflicting orders for product #{product.id}"
        
        conflicting_orders.each do |conflicting_order|
          Rails.logger.info "[StockConflictService] Cancelling order #{conflicting_order.id}"
          cancel_order(conflicting_order, product)
        end
      end
    end

    private

    # Cancel an order and notify the user
    # @param order [Order] the order to cancel
    # @param product [Product] the product that caused the conflict
    def self.cancel_order(order, product)
      message = "Commande automatiquement annulée car le stock du produit #{product.name} est épuisé"
      Rails.logger.info "[StockConflictService] Cancelling order #{order.id} with message: #{message}"
      
      ActiveRecord::Base.transaction do
        # Change order state to canceled
        order.state = 'canceled'
        order.canceled_at = Time.current
        order.save!
        
        # Create an order activity explaining the cancellation
        activity = order.order_activities.create!(
          activity_type: 'canceled',
          note: message,
          operator_profile_id: order.operator_profile_id
        )
        
        Rails.logger.info "[StockConflictService] Created activity #{activity.id} for order #{order.id}"

        begin
          # Get user info
          user = order.statistic_profile.user
          Rails.logger.info "[StockConflictService] Sending notification to user #{user.id} (#{user.email})"
          
          # Deliver the cancellation notification
          notification_type = NotificationType.find_by(name: 'notify_user_order_is_canceled')
          Rails.logger.info "[StockConflictService] Found notification type: #{notification_type.inspect}"
          
          if notification_type
            notification = Notification.create!(
              notification_type: notification_type,
              attached_object: activity,
              receiver: user
            )
            
            Rails.logger.info "[StockConflictService] Created notification #{notification.id}"
            
            begin
              # Force immediate delivery
              result = NotificationsMailer.send_mail_by(notification).deliver_now
              Rails.logger.info "[StockConflictService] Mail delivery result: #{result.inspect}"
            rescue => e
              Rails.logger.error "[StockConflictService] Error sending email: #{e.class.name} - #{e.message}"
              Rails.logger.error e.backtrace.join("\n")
            end
          else
            Rails.logger.error "[StockConflictService] Notification type 'notify_user_order_is_canceled' not found"
          end
        rescue => e
          Rails.logger.error "[StockConflictService] Error in notification process: #{e.class.name} - #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
        end
      end
      
      Rails.logger.info "[StockConflictService] Order #{order.id} successfully cancelled"
    end
  end
end 