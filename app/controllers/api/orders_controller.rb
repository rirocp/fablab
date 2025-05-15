# frozen_string_literal: true

# API Controller for resources of type Order
# Orders are used in store
class API::OrdersController < API::APIController
  before_action :authenticate_user!, except: %i[withdrawal_instructions]
  before_action :set_order, only: %i[show update destroy withdrawal_instructions]

  def index
    @result = ::Orders::OrderService.list(params, current_user)
    @result[:data].each { |order| order.check_and_set_late! } if @result[:data]
  end

  def show; end

  def update
    authorize @order

    begin
      Rails.logger.info "Order update params: #{order_params.inspect}"
      if order_params[:state].present?
        @order = ::Orders::OrderService.update_state(@order, current_user, order_params[:state], order_params[:note])
      else
        Rails.logger.info "Updating order #{@order.id} with admin_comment: #{order_params[:admin_comment]}"
        Rails.logger.info "Order before update: #{@order.attributes.inspect}"
        success = @order.update(order_params)
        Rails.logger.info "Update success: #{success}"
        if !success
          Rails.logger.error "Update failed with errors: #{@order.errors.full_messages}"
          Rails.logger.error "Order after failed update: #{@order.attributes.inspect}"
        else
          @order.reload
          Rails.logger.info "Order after successful update: #{@order.attributes.inspect}"
        end
      end
      render :show
    rescue UpdateOrderStateError => e
      Rails.logger.error "UpdateOrderStateError: #{e.message}"
      render json: { error: 'Transition d\'état invalide' }, status: :unprocessable_entity
    rescue StandardError => e
      Rails.logger.error "Error updating order: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      render json: { error: e.message }, status: :internal_server_error
    end
  end

  def destroy
    authorize @order
    @order.destroy
    head :no_content
  end

  def withdrawal_instructions
    authorize @order

    render html: ::Orders::OrderService.withdrawal_instructions(@order)
  end

  private

  def set_order
    @order = Order.find(params[:id])
  end

  def order_params
    params.require(:order).permit(:state, :note, :project, :admin_comment)
  end
end
