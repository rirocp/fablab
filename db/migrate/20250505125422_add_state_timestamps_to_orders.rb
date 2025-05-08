# Commit
# Adds timestamp columns to the orders table to track state transitions

class AddStateTimestampsToOrders < ActiveRecord::Migration[7.0]
  def change
    add_column :orders, :paid_at, :datetime
    add_column :orders, :in_progress_at, :datetime
    add_column :orders, :canceled_at, :datetime
    add_column :orders, :refunded_at, :datetime
  end
end
