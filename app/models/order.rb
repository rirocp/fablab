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

  # paid = commandé
  # canceled = annulé
  # in progress = prêt effectué
  # refunded = retour effectué
  ALL_STATES = %w[cart paid payment_failed refunded in_progress ready canceled delivered late].freeze

  enum state: ALL_STATES.zip(ALL_STATES).to_h

  validates :token, :state, presence: true

  before_create :add_environment
  after_create :update_reference
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

  def check_and_set_late!
    return unless expected_return_date && !%w[ready delivered canceled refunded].include?(state)
    if expected_return_date.to_date <= Date.today
      update(state: 'late')
    elsif state == 'late' && expected_return_date.to_date >= Date.today
      update(state: 'in_progress')
    end
  end

  def expected_return_date
    return nil unless in_progress_at
    start = in_progress_at.to_date
    months_to_add = 0
    
    if project == 'projet_personnel_1_mois'
      months_to_add = 1
    elsif project&.start_with?('projet_ingenieur_')
      # Extraire le nombre de mois du nom du projet (ex: projet_ingenieur_3_mois -> 3)
      matches = project.match(/projet_ingenieur_(\d+)_mois/)
      months_to_add = matches[1].to_i if matches && matches[1]
    end
    
    return nil if months_to_add.zero?
    start.advance(months: months_to_add)
  end

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

          ProductService.update_stock(product, [{
            stock_type: 'external',
            reason: 'other_out',
            quantity: quantity,
            order_item_id: item.id
          }]).save!
        end
        order_activities.create(
          activity_type: 'in_progress',
          operator_profile_id: operator_profile_id
        )
        # Envoi du premier email immédiatement
        Rails.logger.info "Envoi de l'email notify_user_order_in_progress à #{statistic_profile.user.email}"
        NotificationsMailer.notify_user_order_in_progress(self).deliver_later
        # Planification du second email après 2 minutes
        Rails.logger.info "Planification de NotifyUserOrderReminderWorker pour la commande #{id}"
        NotifyUserOrderReminderWorker.perform_in((RETURN_DEADLINE_MINUTES).minutes, id)
        
        # Gérer les conflits de stock avec d'autres commandes
        Orders::StockConflictService.handle_conflicts(self)
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
            reason: 'returned',
            quantity: quantity,
            order_item_id: item.id
          }]).save!
        end
        order_activities.create(
          activity_type: 'refunded',
          operator_profile_id: operator_profile_id
        )
      end
    when ['paid', 'canceled']
      # Ne pas créer d'activité si l'annulation est faite par StockConflictService
      # Vérifier si une activité d'annulation a déjà été créée dans les dernières secondes
      unless order_activities.where(activity_type: 'canceled')
                           .where('created_at > ?', 5.seconds.ago)
                           .exists?
        # Pas de changement de stock, juste une activité
        order_activities.create(
          activity_type: 'canceled',
          operator_profile_id: operator_profile_id
        )
      end
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

#piti