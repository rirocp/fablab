import apiClient from './clients/api-client';
import { AxiosResponse } from 'axios';
import { Order, OrderIndexFilter, OrderIndex } from '../models/order';
import ApiLib from '../lib/api';

export default class OrderAPI {
  static async index (filters?: OrderIndexFilter): Promise<OrderIndex> {
    try {
      const res: AxiosResponse<OrderIndex> = await apiClient.get(`/api/orders${ApiLib.filtersToQuery(filters, false)}`);
      return res?.data;
    } catch (error) {
      console.error('Error fetching orders list:', error);
      throw error;
    }
  }

  static async get (id: number | string): Promise<Order> {
    try {
      const res: AxiosResponse<Order> = await apiClient.get(`/api/orders/${id}`);
      return res?.data;
    } catch (error) {
      console.error(`Error fetching order #${id}:`, error);
      throw error;
    }
  }

  static async updateState (order: Order, state: string, note?: string): Promise<Order> {
    try {
      const res: AxiosResponse<Order> = await apiClient.patch(`/api/orders/${order.id}`, { order: { state, note } });
      return res?.data;
    } catch (error) {
      console.error(`Error updating order #${order.id} state to ${state}:`, error);
      // Fournir un message d'erreur plus compréhensible
      if (error === 'UpdateOrderStateError') {
        throw 'Changement d\'état non autorisé pour cette commande.';
      }
      throw error;
    }
  }

  static async withdrawalInstructions (order?: Order): Promise<string> {
    try {
      if (!order || !order.id) return '';
      
      const res: AxiosResponse<string> = await apiClient.get(`/api/orders/${order.id}/withdrawal_instructions`);
      return res?.data;
    } catch (error) {
      console.error(`Error fetching withdrawal instructions for order #${order?.id}:`, error);
      return '';
    }
  }
}
