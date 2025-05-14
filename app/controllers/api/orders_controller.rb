# frozen_string_literal: true

# API Controller for resources of type Order
# Orders are used in store
class API::OrdersController < API::APIController
  before_action :authenticate_user!, except: %i[withdrawal_instructions]
  before_action :set_order, only: %i[show update destroy withdrawal_instructions]

  def index
    @result = ::Orders::OrderService.list(params, current_user)
  end

  def show; end

  def update
    authorize @order

    begin
      @order = ::Orders::OrderService.update_state(@order, current_user, order_params[:state], order_params[:note])
      render :show
    rescue UpdateOrderStateError => e
      render json: { error: 'Transition d\'état invalide' }, status: :unprocessable_entity
    rescue StandardError => e
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
    params.require(:order).permit(:state, :note, :project)
  end
end
