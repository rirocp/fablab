/* eslint-disable fabmanager/scoped-translation */
import { useState, useEffect, useRef } from 'react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { IApplication } from '../../models/application';
import { User } from '../../models/user';
import { react2angular } from 'react2angular';
import { Loader } from '../base/loader';
import noImage from '../../../../images/no_image.png';
import { FabStateLabel } from '../base/fab-state-label';
import OrderAPI from '../../api/order';
import { Order, OrderItem, OrderState, OrderProduct } from '../../models/order';
import FormatLib from '../../lib/format';
import OrderLib from '../../lib/order';
import { OrderActions } from './order-actions';

function isOrderProduct (item: OrderItem): item is OrderProduct {
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastActionTime, setLastActionTime] = useState(0);
  const intervalRef = useRef(null);

  // Fonction pour charger les données de la commande
  const loadOrderData = () => {
    OrderAPI.get(orderId).then(data => {
      setOrder(data);
      OrderAPI.withdrawalInstructions(data)
        .then(setWithdrawalInstructions)
        .catch(onError);
    }).catch(onError);
  };

  // Chargement initial
  useEffect(() => {
    loadOrderData();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Mettre en place un rafraîchissement périodique après une action
  useEffect(() => {
    if (lastActionTime > 0) {
      // Charger immédiatement après une action
      loadOrderData();

      // Mettre en place un rafraîchissement périodique
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        loadOrderData();
      }, 2000); // Rafraîchir toutes les 2 secondes

      // Arrêter le rafraîchissement après 10 secondes
      setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 10000);
    }
  }, [lastActionTime]);

  /**
   * Check if the current operator has administrative rights or is a normal member
   */
  const isPrivileged = (): boolean => {
    return (currentUser?.role === 'admin' || currentUser?.role === 'manager');
  };

  /**
   * Returns order's payment info
   */
  const paymentInfo = (): string => {
    let paymentVerbose = '';
    if (order.payment_method === 'card') {
      paymentVerbose = t('app.shared.store.show_order.payment.settlement_by_debit_card');
    } else if (order.payment_method === 'wallet') {
      paymentVerbose = t('app.shared.store.show_order.payment.settlement_by_wallet');
    } else {
      paymentVerbose = t('app.shared.store.show_order.payment.settlement_done_at_the_reception');
    }
    paymentVerbose += ' ' + t('app.shared.store.show_order.payment.on_DATE_at_TIME', {
      DATE: FormatLib.date(order.payment_date),
      TIME: FormatLib.time(order.payment_date)
    });

    // Commit de l'information du projet
    let projectLabel = '';
    if (order.project === 'projet_ingenieur_9_mois') {
      projectLabel = t('app.public.show_order.project_engineer_9_months', { defaultValue: 'Projet ingénieur (9 mois)' });
    } else if (order.project === 'projet_personnel_1_mois') {
      projectLabel = t('app.public.show_order.project_personal_1_month', { defaultValue: 'Projet personnel (1 mois)' });
    }
    if (projectLabel) {
      paymentVerbose += ' - ' + t('app.shared.store.show_order.payment.for_project_PROJECT', {
        PROJECT: projectLabel,
        defaultValue: `Le type de projet : ${projectLabel}`
      });
    } else {
      paymentVerbose += ' Projet non spécifié.';
    }

    // Ajout de l'historique des changements d'état
    // Dédupliquer les activités en gardant la première occurrence de chaque type d'état
    const uniqueStateActivities = order.order_activities?.reduce((acc, activity) => {
      if (!['in_progress', 'canceled', 'refunded'].includes(activity.activity_type)) {
        return acc;
      }
      // Si on n'a pas encore vu cet état, l'ajouter
      if (!acc.some(a => a.activity_type === activity.activity_type)) {
        acc.push(activity);
      }
      return acc;
    }, []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (uniqueStateActivities?.length > 0) {
      uniqueStateActivities.forEach(activity => {
        const operatorName = activity.operator?.name;
        // Utiliser created_at de l'activité si le timestamp d'état n'est pas disponible
        const date = order[`${activity.activity_type}_at`] || activity.created_at;

        let translationKey = '';
        switch (activity.activity_type) {
          case 'in_progress':
            translationKey = 'app.shared.store.show_order.payment.loan_started_on_DATE_at_TIME_by_OPERATOR';
            break;
          case 'canceled':
            translationKey = 'app.shared.store.show_order.payment.order_canceled_on_DATE_at_TIME_by_OPERATOR';
            break;
          case 'refunded':
            translationKey = 'app.shared.store.show_order.payment.order_refunded_on_DATE_at_TIME_by_OPERATOR';
            break;
        }

        if (translationKey) {
          paymentVerbose += ' - ' + t(translationKey, {
            DATE: FormatLib.date(date),
            TIME: FormatLib.time(date),
            OPERATOR: operatorName || t('app.shared.store.show_order.payment.unknown_operator', { defaultValue: 'Opérateur inconnu' })
          });
        }
      });
    }

    return paymentVerbose;
  };

  /**
   * Callback after action success
   */
  const handleActionSuccess = (data: Order, message: string) => {
    // Mettre à jour le state localement
    console.log('Action success, new data:', data);
    setOrder(data);
    // Déclencer le rafraîchissement périodique
    setLastActionTime(Date.now());
    // Afficher le message de succès
    onSuccess(message);
    // Rafraîchir l'interface
    setRefreshKey(prevKey => prevKey + 1);
  };

  /**
   * Force le rechargement de la page
   */
  const forceReload = () => {
    window.location.reload();
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
   * TODO, document this method
   */
  const getExpectedReturnDate = () => {
    if (!order?.in_progress_at) return null;
    const start = new Date(order.in_progress_at);
    let monthsToAdd = 0;
    if (order.project === 'projet_ingenieur_9_mois') {
      monthsToAdd = 9;
    } else if (order.project === 'projet_personnel_1_mois') {
      monthsToAdd = 1;
    } else {
      return null;
    }
    const expected = new Date(start);
    expected.setMonth(expected.getMonth() + monthsToAdd);
    return expected;
  };

  if (!order) {
    return null;
  }

  return (
    <div className="show-order">
      <header>
        <h2>[{order.reference}]</h2>
        <div className="grpBtn">
          {isPrivileged() &&
            <OrderActions key={refreshKey} order={order} onSuccess={handleActionSuccess} onError={onError} />
          }
          {order?.invoice_id && (
            <a href={`/api/invoices/${order?.invoice_id}/download`}
              target='_blank'
              className='fab-button is-black'
              rel='noreferrer'>
              {t('app.shared.store.show_order.see_invoice')}
            </a>
          )}
          <button onClick={forceReload} className="fab-button is-black">
            Actualiser
          </button>
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
            <span>{t('app.shared.store.show_order.expected_return_date')}</span>
            <p>
              {getExpectedReturnDate() ? FormatLib.date(getExpectedReturnDate()) : t('app.shared.store.show_order.no_expected_return')}
            </p>
          </div>
          <FabStateLabel key={refreshKey} status={OrderLib.statusColor(order)} background>
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
            </article>
          ))}
        </div>
      </div>

      <div className="subgrid">
        <div className="payment-info">
          <label>{t('app.shared.store.show_order.payment_informations')}</label>
          {<p>{paymentInfo()}</p>}
        </div>
        <div className="withdrawal-instructions">
          <label>{t('app.shared.store.show_order.pickup')}</label>
          <p dangerouslySetInnerHTML={{ __html: withdrawalInstructions }} />
        </div>
      </div>
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
