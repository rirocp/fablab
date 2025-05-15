class AddAdminCommentToOrders < ActiveRecord::Migration[7.0]
  def change
    add_column :orders, :admin_comment, :text
  end
end
