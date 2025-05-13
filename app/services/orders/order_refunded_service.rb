# frozen_string_literal: true

# Provides a method to refund an order
class Orders::OrderRefundedService
  def call(order, current_user)
    # N'autoriser que la transition depuis 'in_progress'
    raise ::UpdateOrderStateError unless order.state == 'in_progress'

    order.state = 'refunded'
    ActiveRecord::Base.transaction do
      activity = order.order_activities.create(activity_type: 'refunded', operator_profile_id: current_user.invoicing_profile.id)
      order.save
      NotificationCenter.call type: 'notify_user_order_is_refunded',
                              receiver: order.statistic_profile.user,
                              attached_object: activity
    end
    order.reload
  end
end
