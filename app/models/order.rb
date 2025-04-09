# frozen_string_literal: true

# Order is a model used to hold orders data
class Order < PaymentDocument
  belongs_to :statistic_profile
  belongs_to :operator_profile, class_name: 'InvoicingProfile'
  belongs_to :coupon
  belongs_to :invoice
  has_many :order_items, dependent: :destroy
  has_one :payment_gateway_object, as: :item, dependent: :destroy
  has_many :order_activities, dependent: :destroy
  after_save :handle_state_change, if: :saved_change_to_state?

  # paid = commandé
  # canceled = annulé
  # in progress = prêt effectué
  # refunded = retour effectué
  ALL_STATES = %w[cart paid payment_failed refunded in_progress ready canceled delivered].freeze


  enum state: ALL_STATES.zip(ALL_STATES).to_h

  validates :token, :state, presence: true

  before_create :add_environment
  after_create :update_reference
  # Nouveau
  after_save :handle_state_change, if: :saved_change_to_state?

  delegate :user, to: :statistic_profile

  alias_attribute :order_number, :reference

  def generate_reference(_date = Time.current)
    self.reference = PaymentDocumentService.generate_order_number(self)
  end

  def footprint_children
    order_items
  end

  def paid_by_card?
    !payment_gateway_object.nil? && payment_method == 'card'
  end

  def self.columns_out_of_footprint
    %w[payment_method]
  end

  # Nouveau
  private
  def handle_state_change
    case [state_before_last_save, state]
    when ['paid', 'in_progress']
      # Débit du stock lors du passage à "Prêt effectué"
      ActiveRecord::Base.transaction do
        order_items.each do |item|
          next unless item.orderable_type == 'Product'

          product = item.orderable
          quantity = item.quantity || 1
          # Vérification du stock (cohérent avec Orders::OrderService.in_stock?)
          available_stock = product.stock['external'] || 0
          raise Cart::OutStockError, "Stock insuffisant pour #{product.name}" if available_stock < quantity

          # order.order_items.each do |item|
          #  ProductService.update_stock(item.orderable,
          #                              [{ stock_type: 'external', reason: 'sold', quantity: item.quantity, order_item_id: item.id }]).save
          # end

          # Débit du stock

          ProductService.update_stock(product, [{
            stock_type: 'external',
            reason: 'borrowed',
            quantity: quantity,
            order_item_id: item.id
          }]).save!
        end
        order_activities.create(
          activity_type: 'in_progress',
        )
        # Commit 14
        # Envoi du premier email immédiatement
        NotificationsMailer.notify_user_order_in_progress(self).deliver_later
        # Planification du second email après 2 minutes
        NotifyUserOrderReminderWorker.new.perform_in(2.minutes, id)
      end

    when ['in_progress', 'refunded']
      # Restitution du stock lors du passage à "Retour effectué"
      ActiveRecord::Base.transaction do
        order_items.each do |item|
          next unless item.orderable_type == 'Product'

          product = item.orderable
          quantity = item.quantity || 1
          ProductService.update_stock(product, [{
            stock_type: 'external',
            reason: 'returned',  # Raison valide dans INCOMING_REASONS
            quantity: quantity,  # Quantité positive pour ajouter au stock
            order_item_id: item.id
          }]).save!
        end
        order_activities.create(activity_type: 'refunded')
      end

    when ['paid', 'canceled']
      # Pas de changement de stock, juste une activité
      order_activities.create(activity_type: 'canceled')
    end
  end

  def add_environment
    self.token = Rails.env[0..2] + token
  end

  def update_reference
    generate_reference
    save
  end
end
