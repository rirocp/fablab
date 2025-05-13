import { useState, useEffect } from 'react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { IApplication } from '../../models/application';
import { User } from '../../models/user';
import { react2angular } from 'react2angular';
import { Loader } from '../base/loader';
import noImage from '../../../../images/no_image.png';
import { FabStateLabel } from '../base/fab-state-label';
import OrderAPI from '../../api/order';
import { Order, OrderActivity } from '../../models/order';
import FormatLib from '../../lib/format';
import OrderLib from '../../lib/order';
import { OrderActions } from './order-actions';
import { OrderItem, OrderProduct } from '../../models/order'; //Commit

function isOrderProduct(item: OrderItem): item is OrderProduct {
  return item.orderable_type === 'Product';
}

declare const Application: IApplication;

interface ShowOrderProps {
  orderId: string,
  currentUser?: User,
  onSuccess: (message: string) => void,
  onError: (message: string) => void,
}

/**
 * This component shows an order details
 */
export const ShowOrder: React.FC<ShowOrderProps> = ({ orderId, currentUser, onSuccess, onError }) => {
  const { t } = useTranslation('shared');

  const [order, setOrder] = useState<Order>();
  const [withdrawalInstructions, setWithdrawalInstructions] = useState<string>(null);

  useEffect(() => {
    OrderAPI.get(orderId).then(data => {
      setOrder(data);
      OrderAPI.withdrawalInstructions(data)
        .then(setWithdrawalInstructions)
        .catch(onError);
    }).catch(onError);
  }, []);

  /**
   * Check if the current operator has administrative rights or is a normal member
   */
  const isPrivileged = (): boolean => {
    return (currentUser?.role === 'admin' || currentUser?.role === 'manager');
  };

  /**
   * Returns order's payment info with activity history
   */
  const paymentInfo = (): string => {
    if (!order) return '';
    
    let info = [];
    
    // Paiement initial
    if (order.payment_method) {
      let paymentVerbose = '';
      if (order.payment_method === 'card') {
        paymentVerbose = t('app.shared.store.show_order.payment.settlement_by_debit_card');
      } else if (order.payment_method === 'wallet') {
        paymentVerbose = t('app.shared.store.show_order.payment.settlement_by_wallet');
      } else {
        paymentVerbose = t('app.shared.store.show_order.payment.settlement_done_at_the_reception');
      }
      
      if (order.payment_date) {
        paymentVerbose += ' ' + t('app.shared.store.show_order.payment.on_DATE_at_TIME', {
          DATE: FormatLib.date(order.payment_date),
          TIME: FormatLib.time(order.payment_date)
        });
      }

      // Ajout du type de projet
      let projectLabel = '';
      if (order.project === 'projet_ingenieur_9_mois') {
        projectLabel = t('app.public.store_cart.project_engineer_9_months', { defaultValue: 'Projet ingénieur (9 mois)' });
      } else if (order.project === 'projet_personnel_1_mois') {
        projectLabel = t('app.public.store_cart.project_personal_1_month', { defaultValue: 'Projet personnel (1 mois)' });
      }
      
      if (projectLabel) {
        paymentVerbose += ' ' + t('app.shared.store.show_order.payment.for_project_PROJECT', {
          PROJECT: projectLabel,
          defaultValue: `for project: ${projectLabel}`
        });
      }
      
      info.push(`<p>${paymentVerbose}</p>`);
    }
    
    // Ajout de l'historique des activités dans les informations de paiement
    if (order.activities && order.activities.length > 0) {
      let hasAddedActivities = false;
      
      order.activities.forEach(activity => {
        if (activity.activity_type === 'paid') return; // Le paiement est déjà inclus ci-dessus
        
        const activityInfo = getActivityDescription(activity);
        if (activityInfo) {
          if (!hasAddedActivities && info.length > 0) {
            // Ajouter un séparateur avant le premier élément d'historique
            info.push('<hr />');
            info.push(`<h4>${t('app.shared.store.show_order.activity.history', { defaultValue: 'Historique des changements' })}</h4>`);
            hasAddedActivities = true;
          }
          info.push(`<p>${activityInfo}</p>`);
        }
      });
    }
    
    return info.join('');
  };
  
  /**
   * Obtient une description formatée pour une activité
   */
  const getActivityDescription = (activity: OrderActivity): string => {
    const activityDate = FormatLib.dateTime(activity.created_at);
    const operator = activity.operator ? activity.operator.name : t('app.shared.store.show_order.unknown_operator');
    
    let actionLabel = '';
    let actionClass = '';
    
    switch (activity.activity_type) {
      case 'in_progress':
        actionLabel = t('app.shared.store.show_order.activity.loan_started', { defaultValue: 'Prêt démarré' });
        actionClass = 'text-primary';
        break;
      case 'ready':
        actionLabel = t('app.shared.store.show_order.activity.ready_for_pickup', { defaultValue: 'Prêt pour retrait' });
        actionClass = 'text-info';
        break;
      case 'canceled':
        actionLabel = t('app.shared.store.show_order.activity.order_canceled', { defaultValue: 'Commande annulée' });
        actionClass = 'text-danger';
        break;
      case 'refunded':
        actionLabel = t('app.shared.store.show_order.activity.items_returned', { defaultValue: 'Articles retournés' });
        actionClass = 'text-success';
        break;
      case 'delivered':
        actionLabel = t('app.shared.store.show_order.activity.order_delivered', { defaultValue: 'Commande livrée' });
        actionClass = 'text-success';
        break;
      default:
        actionLabel = t(`app.shared.store.show_order.activity.${activity.activity_type}`, { 
          defaultValue: activity.activity_type 
        });
        actionClass = '';
    }
    
    const description = t('app.shared.store.show_order.activity.description', {
      ACTION: `<span class="${actionClass}">${actionLabel}</span>`,
      DATE: `<strong>${activityDate}</strong>`,
      OPERATOR: `<em>${operator}</em>`,
      defaultValue: `${actionLabel} le ${activityDate} par ${operator}`
    });
    
    if (activity.note) {
      return `${description}<br/><span class="activity-note">${t('app.shared.store.show_order.activity.note', { defaultValue: 'Note' })}: "${activity.note}"</span>`;
    }
    
    return description;
  };

  /**
   * Commit retourne le libellé d'un type de projet
   */
  const getProjectLabel = (projectCode: string): string => {
    if (projectCode === 'projet_ingenieur_9_mois') {
      return t('app.public.store_cart.project_engineer_9_months', { defaultValue: 'Projet ingénieur (9 mois)' });
    } else if (projectCode === 'projet_personnel_1_mois') {
      return t('app.public.store_cart.project_personal_1_month', { defaultValue: 'Projet personnel (1 mois)' });
    }
    return t('app.shared.store.show_order.no_project', { defaultValue: 'No project specified' });
  };

  /**
   * Callback after action success
   */
  const handleActionSuccess = (data: Order, message: string) => {
    setOrder(data);
    onSuccess(message);
  };

  /**
   * Ruturn item's ordrable url
   */
  const itemOrderableUrl = (item) => {
    if (isPrivileged()) {
      return `/#!/admin/store/products/${item.orderable_id}/edit`;
    }
    return `/#!/store/p/${item.orderable_slug}`;
  };

  /**
   * Retourne le libellé d'une activité
   */
  const getActivityLabel = (activity: OrderActivity): string => {
    const activityType = activity.activity_type;
    const dateTime = FormatLib.dateTime(activity.created_at);
    const operator = activity.operator ? activity.operator.name : t('app.shared.store.show_order.unknown_operator');
    
    let actionLabel = t(`app.shared.store.show_order.activity.${activityType}`, { 
      defaultValue: activityType 
    });
    
    return t('app.shared.store.show_order.activity.entry', {
      ACTION: actionLabel,
      DATETIME: dateTime,
      OPERATOR: operator,
      defaultValue: `${actionLabel} - ${dateTime} by ${operator}`
    });
  };

  if (!order) {
    return null;
  }

  return (
    <div className='show-order'>
      <header>
        <h2>[{order.reference}]</h2>
        <div className="grpBtn">
          {isPrivileged() &&
            <OrderActions order={order} onSuccess={handleActionSuccess} onError={onError} />
          }
          {order?.invoice_id && (
            <a href={`/api/invoices/${order?.invoice_id}/download`}
              target='_blank'
              className='fab-button is-black'
              rel='noreferrer'>
              {t('app.shared.store.show_order.see_invoice')}
            </a>
          )}
        </div>
      </header>

      <div className="client-info">
        <label>{t('app.shared.store.show_order.tracking')}</label>
        <div className="content">
          {isPrivileged() && order.user &&
            <div className='group'>
              <span>{t('app.shared.store.show_order.client')}</span>
              <p>{order.user.name}</p>
            </div>
          }
          <div className='group'>
            <span>{t('app.shared.store.show_order.created_at')}</span>
            <p>{FormatLib.date(order.created_at)}</p>
          </div>
          <div className='group'>
            <span>{t('app.shared.store.show_order.last_update')}</span>
            <p>{FormatLib.date(order.updated_at)}</p>
          </div>
          <div className='group'>
            <span>{t('app.shared.store.show_order.project')}</span>
            <p>{getProjectLabel(order.project)}</p>
          </div>
          <FabStateLabel status={OrderLib.statusColor(order)} background>
            {t(`app.shared.store.show_order.state.${OrderLib.statusText(order)}`)}
          </FabStateLabel>
        </div>
      </div>

      <div className="cart">
        <label>{t('app.shared.store.show_order.cart')}</label>
        <div className='store-cart-list'>
          {order.order_items_attributes.map(item => (
            <article className='store-cart-list-item' key={item.id}>
              <div className='picture'>
                <img alt='' src={item.orderable_main_image_url || noImage} />
              </div>
              <div className="ref">
                {isOrderProduct(item) && (
                  <span>{t('app.shared.store.show_order.reference_short')} {item.orderable_ref || ''}</span>
                )}
                <p><a className="text-black" href={itemOrderableUrl(item)}>{item.orderable_name}</a></p>
                <span className="count">{item.quantity}</span>
              </div>
              {/* Commit
              <div className="actions">
              <span className="count">{item.quantity}</span>
              </div>
                {/* Commit
                <div className='price'>
                  <p>{FormatLib.price(item.amount)}</p>
                  <span>/ {t('app.shared.store.show_order.unit')}</span>
                </div>
                */}
                {/* Commit
                <span className="count">{item.quantity}</span>
                <div className='total'>
                  <span>{t('app.shared.store.show_order.item_total')}</span>
                  <p>{FormatLib.price(OrderLib.itemAmount(item))}</p>
                </div>
              </div>*/}
            </article>
          ))}
        </div>
      </div>

      <div className="subgrid">
        <div className="payment-info">
          <label>{t('app.shared.store.show_order.payment_informations')}</label>
          <div dangerouslySetInnerHTML={{ __html: paymentInfo() }} />
        </div>
      </div>

      {/* Ajout de l'historique des activités */}
      {order.activities && order.activities.length > 0 && (
        <div className="order-activities">
          <label>{t('app.shared.store.show_order.order_history', { defaultValue: 'Order History' })}</label>
          <div className="activities-list">
            {order.activities.map((activity) => (
              <div key={activity.id} className="activity-item">
                <p>{getActivityLabel(activity)}</p>
                {activity.note && (
                  <div className="activity-note" dangerouslySetInnerHTML={{ __html: activity.note }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ShowOrderWrapper: React.FC<ShowOrderProps> = (props) => {
  return (
    <Loader>
      <ShowOrder {...props} />
    </Loader>
  );
};

Application.Components.component('showOrder', react2angular(ShowOrderWrapper, ['orderId', 'currentUser', 'onError', 'onSuccess']));
