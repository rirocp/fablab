# frozen_string_literal: true

# OrderActivity is a model for hold activity of order
class OrderActivity < ApplicationRecord
  belongs_to :order
  belongs_to :operator_profile, class_name: 'InvoicingProfile', optional: true

  TYPES = %w[paid payment_failed refunded in_progress ready canceled delivered note].freeze
  enum activity_type: TYPES.zip(TYPES).to_h

  validates :activity_type, presence: true
end
