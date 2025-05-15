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
import { FormRichText } from '../form/form-rich-text';
import { useForm } from 'react-hook-form';

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastActionTime, setLastActionTime] = useState(0);
  const intervalRef = useRef(null);
  const { control, setValue } = useForm();
  const [adminComment, setAdminComment] = useState('');
  const [saving, setSaving] = useState(false);

  // Fonction pour charger les données de la commande
  const loadOrderData = () => {
    OrderAPI.get(orderId).then(data => {
      console.log('Order loaded from API:', data);
      console.log('Admin comment in loaded order:', data.admin_comment);
      setOrder(data);
      // Mettre à jour le commentaire admin quand les données sont chargées
      setAdminComment(data.admin_comment || '');
      setValue('admin_comment', data.admin_comment || '');
    }).catch(onError);
  };

  // Chargement initial
  useEffect(() => {
    console.log('Initial load');
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

  // Met à jour le state si la commande change (ex: après reload)
  useEffect(() => {
    console.log('Order changed, updating admin comment state');
    console.log('Admin comment in order:', order?.admin_comment);
    if (order?.admin_comment !== undefined) {
      setAdminComment(order.admin_comment || '');
      setValue('admin_comment', order.admin_comment || '');
    }
  }, [order]);

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
    if (order.project) {
      if (order.project === 'projet_personnel_1_mois') {
        projectLabel = t('app.public.show_order.project_personal_1_month', { defaultValue: 'Projet personnel (1 mois)' });
      } else if (order.project.startsWith('projet_ingenieur_')) {
        // Extraire le nombre de mois du nom du projet (ex: projet_ingenieur_3_mois -> 3)
        const matches = order.project.match(/projet_ingenieur_(\d+)_mois/);
        if (matches && matches[1]) {
          const months = matches[1];
          projectLabel = t('app.public.show_order.project_engineer_x_months',
            { defaultValue: `Projet ingénieur (${months} mois)`, MONTHS: months });
        }
      }
    }
    if (projectLabel) {
      paymentVerbose += ' - ' + t('app.shared.store.show_order.payment.for_project_PROJECT', {
        PROJECT: projectLabel,
        defaultValue: `Le type de projet : ${projectLabel}`
      });
    } else {
      paymentVerbose += ' Projet non spécifié.';
    }

    // Debug complet des activités de la commande
    console.log('All order activities:', order.order_activities);

    // Compter les activités par type
    const activityCounts = order.order_activities?.reduce((acc, act) => {
      acc[act.activity_type] = (acc[act.activity_type] || 0) + 1;
      return acc;
    }, {});
    console.log('Activity counts by type:', activityCounts);

    // Compter les activités d'annulation avec et sans note
    const canceledWithNote = order.order_activities?.filter(act =>
      act.activity_type === 'canceled' && act.note !== null && act.note !== undefined && act.note !== '').length || 0;
    const canceledWithoutNote = order.order_activities?.filter(act =>
      act.activity_type === 'canceled' && (act.note === null || act.note === undefined || act.note === '')).length || 0;
    console.log('Canceled activities with note:', canceledWithNote);
    console.log('Canceled activities without note:', canceledWithoutNote);

    // Afficher toutes les notes d'annulation
    const cancelNotes = order.order_activities?.filter(act =>
      act.activity_type === 'canceled' && act.note !== null && act.note !== undefined && act.note !== '')
      .map(act => act.note);
    console.log('All cancellation notes:', cancelNotes);

    // Ajout de l'historique des changements d'état
    // Dédupliquer les activités en gardant la première occurrence de chaque type d'état
    // MODIFICATION: Pour les annulations, garder l'activité avec une note si elle existe
    const uniqueStateActivities = order.order_activities?.reduce((acc, activity) => {
      console.log('Activity being processed:', activity);
      if (!['in_progress', 'canceled', 'refunded'].includes(activity.activity_type)) {
        return acc;
      }

      // Cas spécial pour les annulations: privilégier l'activité avec une note
      if (activity.activity_type === 'canceled') {
        // Chercher si on a déjà une activité d'annulation
        const existingCanceledIndex = acc.findIndex(a => a.activity_type === 'canceled');

        if (existingCanceledIndex >= 0) {
          // On a déjà une activité d'annulation
          const existingActivity = acc[existingCanceledIndex];

          // Si l'activité actuelle a une note et l'existante n'en a pas, remplacer
          if (activity.note && (!existingActivity.note || existingActivity.note === '')) {
            console.log('Replacing canceled activity without note with one with note');
            acc[existingCanceledIndex] = activity;
          }
        } else {
          // Pas encore d'activité d'annulation, ajouter celle-ci
          acc.push(activity);
        }
      } else {
        // Pour les autres types, juste garder la première occurrence
        if (!acc.some(a => a.activity_type === activity.activity_type)) {
          acc.push(activity);
        }
      }

      return acc;
    }, []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    console.log('Unique state activities:', uniqueStateActivities);

    if (uniqueStateActivities?.length > 0) {
      uniqueStateActivities.forEach(activity => {
        // Debug: Afficher les informations de l'activité dans la console
        console.log('Activity:', activity);
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

          // Détecter les annulations par conflit de stock
          if (activity.activity_type === 'canceled') {
            console.log('Processing canceled activity:', activity);
            console.log('Canceled activity note:', activity.note);
            // Si une note est présente pour l'activité d'annulation
            if (activity.note) {
              // Afficher la note de l'activité
              paymentVerbose += ' - ' + activity.note;
            }
            // Si l'annulation est automatique par stock épuisé (vérification moins stricte)
            if (activity.note && (
              activity.note.includes('stock') ||
              activity.note.includes('épuisé') ||
              activity.note.includes('automatique')
            )) {
              console.log('Detected stock conflict cancellation');
            }
          }
        }
      });
    }
    paymentVerbose += '.';
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
   * Calcule la date de retour prévue en fonction du projet sélectionné
   */
  const getExpectedReturnDate = () => {
    if (!order?.in_progress_at) return null;
    const start = new Date(order.in_progress_at);
    // Extraire le nombre de mois du projet
    const projectType = order.project || '';
    let monthsToAdd = 0;
    if (projectType === 'projet_personnel_1_mois') {
      monthsToAdd = 1;
    } else if (projectType.startsWith('projet_ingenieur_')) {
      // Extraire le nombre de mois du nom du projet (ex: projet_ingenieur_3_mois -> 3)
      const matches = projectType.match(/projet_ingenieur_(\d+)_mois/);
      if (matches && matches[1]) {
        monthsToAdd = parseInt(matches[1], 10);
      }
    }

    if (monthsToAdd === 0) return null;

    const expected = new Date(start);
    expected.setMonth(expected.getMonth() + monthsToAdd);
    return expected;
  };

  // Gestion du changement de commentaire admin
  const handleAdminCommentChange = (content: string) => {
    console.log('Admin comment changed:', content);
    setAdminComment(content);
    setValue('admin_comment', content);
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
          {/*
          <div className='group'>
            <span>{t('app.shared.store.show_order.last_update')}</span>
            <p>{FormatLib.date(order.updated_at)}</p>
          </div>
          */}
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
        {isPrivileged() && (
          <div className="admin-comment-section">
            <label>{t('app.admin.store.orders.admin_comment', { defaultValue: 'Commentaire de l\'administrateur' })}</label>
            <div className="content">
              <FormRichText
                control={control}
                id="admin_comment"
                valueDefault={adminComment}
                limit={400}
                heading
                bulletList
                link
                onValueChange={handleAdminCommentChange}
              />
              <button
                className="fab-button is-main"
                onClick={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    console.log('Sending admin comment:', adminComment);
                    const updatedOrder = await OrderAPI.update(order.id, { admin_comment: adminComment });
                    console.log('Server response:', updatedOrder);
                    console.log('Admin comment in response:', updatedOrder.admin_comment);
                    // Mettre à jour tout l'état local
                    setOrder(updatedOrder);
                    setAdminComment(updatedOrder.admin_comment || '');
                    setValue('admin_comment', updatedOrder.admin_comment || '');
                    // Déclencher une mise à jour pour s'assurer que tout est à jour
                    setLastActionTime(Date.now());
                    onSuccess('Commentaire enregistré');
                  } catch (err) {
                    console.error('Error saving comment:', err);
                    onError('Erreur lors de la sauvegarde');
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                {saving ? t('app.shared.saving', { defaultValue: 'Enregistrement...' }) : t('app.shared.save', { defaultValue: 'Enregistrer' })}
              </button>
            </div>
          </div>
        )}
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
