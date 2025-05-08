class AddProjectToOrders < ActiveRecord::Migration[5.2]
  def change
    add_column :orders, :project, :string
  end
end
