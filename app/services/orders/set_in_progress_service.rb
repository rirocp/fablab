# frozen_string_literal: true

# Provides a method to set the order state to "in progress"
class Orders::SetInProgressService
  def call(order, current_user)
    # N'autoriser que la transition de l'état 'paid' vers 'in_progress'
    raise ::UpdateOrderStateError unless order.state == 'paid'

    order.state = 'in_progress'
    order.order_activities.push(OrderActivity.new(activity_type: 'in_progress', operator_profile_id: current_user.invoicing_profile.id))
    order.save
    order.reload
  end
end
