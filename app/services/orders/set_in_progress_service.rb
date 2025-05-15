# frozen_string_literal: true

# Provides a method to set the order state to "in progress"
class Orders::SetInProgressService
  def call(order, current_user)
    raise ::UpdateOrderStateError if %w[cart payment_failed in_progress canceled delivered].include?(order.state)

    ActiveRecord::Base.transaction do
      order.state = 'in_progress'
      order.in_progress_at = Time.current
      order.order_activities.create(
        activity_type: 'in_progress',
        operator_profile_id: current_user.invoicing_profile.id
      )
      order.save!
      
      # Cancel other orders for products with limited stock
      Orders::StockConflictService.handle_conflicts(order)
    end
    order.reload
  end
end
