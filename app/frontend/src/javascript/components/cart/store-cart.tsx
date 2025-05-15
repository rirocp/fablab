import { useState, useEffect } from 'react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { react2angular } from 'react2angular';
import { Loader } from '../base/loader';
import type { IApplication } from '../../models/application';
import { FabButton } from '../base/fab-button';
import useCart from '../../hooks/use-cart';
import FormatLib from '../../lib/format';
import CartAPI from '../../api/cart';
import type { User } from '../../models/user';
import { PaymentModal } from '../payment/stripe/payment-modal';
import { PaymentMethod } from '../../models/payment';
import type { Order, OrderCartItemReservation, OrderErrors, OrderProduct } from '../../models/order';
import { MemberSelect } from '../user/member-select';
import { CouponInput } from '../coupon/coupon-input';
import type { Coupon } from '../../models/coupon';
import OrderLib from '../../lib/order';
import _ from 'lodash';
import OrderAPI from '../../api/order';
import { CartOrderProduct } from './cart-order-product';
import { CartOrderReservation } from './cart-order-reservation';
import Select from 'react-select'; // Commit ajout de la bibliothèque Select pour la liste déroulante
import { SelectOption } from '../../models/select';

declare const Application: IApplication;

interface StoreCartProps {
  onSuccess: (message: string) => void,
  onError: (message: string) => void,
  userLogin: () => void,
  currentUser?: User
}

/**
 * Commit options de projet pour la liste déroulante
 */
const projectOptions: Array<SelectOption<string>> = [
  { value: 'projet_ingenieur_9_mois', label: 'Projet ingénieur (9 mois)' },
  { value: 'projet_personnel_1_mois', label: 'Projet personnel (1 mois)' }
];

/**
 * This component shows user's cart
 */
const StoreCart: React.FC<StoreCartProps> = ({ onSuccess, onError, currentUser, userLogin }) => {
  const { t } = useTranslation('public');

  const [selectedProject, setSelectedProject] = useState<SelectOption<string>>(null); // État pour le projet sélectionné
  const { cart, setCart, reloadCart } = useCart(currentUser, selectedProject?.value);
  const [cartErrors, setCartErrors] = useState<OrderErrors>(null);
  const [noMemberError, setNoMemberError] = useState<boolean>(false);
  const [paymentModal, setPaymentModal] = useState<boolean>(false);
  const [withdrawalInstructions, setWithdrawalInstructions] = useState<string>(null);
  const [noProjectError, setNoProjectError] = useState<boolean>(false); // État pour l'erreur de projet non sélectionné

  useEffect(() => {
    if (cart) {
      checkCart();
    }
    if (cart && !withdrawalInstructions) {
      OrderAPI.withdrawalInstructions(cart)
        .then(setWithdrawalInstructions)
        .catch(onError);
    }
  }, [cart]);

  useEffect(() => {
    if (!cart?.user) {
      setPaymentModal(false);
    }
  }, [cart]);

  useEffect(() => {
    if (cart?.project && !selectedProject) {
      setSelectedProject(projectOptions.find(option => option.value === cart.project) || null);
    }
  }, [cart]);

  /**
   * Check if the current cart is empty ?
   */
  const cartIsEmpty = (): boolean => {
    return cart && cart.order_items_attributes.length === 0;
  };

  /**
   * Check the current cart's items (available, price, stock, quantity_min)
   */
  const checkCart = async (): Promise<OrderErrors> => {
    const errors = await CartAPI.validate(cart);
    setCartErrors(errors);
    return errors;
  };

  /**
   * Checkout cart
   */
  const checkout = () => {
    console.log('selectedProject:', selectedProject);
    if (!currentUser) {
      userLogin();
    } else {
      if (!cart.user) {
        setNoMemberError(true);
        onError(t('app.public.store_cart.select_user'));
      } else if (!selectedProject) {
        // Commit vérification pour les utilisateurs
        setNoProjectError(true);
        onError(t('app.public.store_cart.select_project_required'));
      } else {
        setNoMemberError(false);
        setNoProjectError(false);
        checkCart().then(errors => {
          if (!hasCartErrors(errors)) {
            const updatedCart = { ...cart, project: selectedProject?.value }; // Commit ajout du projet au panier
            setCart(updatedCart);
            setPaymentModal(true);
          }
        });
      }
    }
  };

  /**
   * Check if the carrent cart has any error
   */
  const hasCartErrors = (errors: OrderErrors) => {
    if (!errors) return false;
    for (const item of cart.order_items_attributes) {
      const error = _.find(errors.details, (e) => e.item_id === item.id);
      if (!error || error?.errors?.length > 0) return true;
    }
    return false;
  };

  /**
   * Open/closes the payment modal
   */
  const togglePaymentModal = (): void => {
    setPaymentModal(!paymentModal);
  };

  /**
   * Handle payment
   */
  const handlePaymentSuccess = (data: Order): void => {
    if (data.state === 'paid') {
      setPaymentModal(false);
      window.location.href = '/#!/store';
      onSuccess(t('app.public.store_cart.checkout_success'));
    } else {
      onError(t('app.public.store_cart.checkout_error'));
    }
  };

  /**
   * Change cart's customer by admin/manager
   * Commit : Include the selected project
   */
  // Old code
  // const handleChangeMember = (user: User): void => {
  // CartAPI.setCustomer(cart, user.id).then(setCart).catch(onError); };

  const handleChangeMember = (user: { id: number, name: string, project?: string }): void => {
    CartAPI.setCustomer(cart, user.id).then(data => {
      // Ajouter le projet au panier
      const updatedCart = { ...data, project: user.project };
      setCart(updatedCart);
      // Stocker le projet sélectionné
      // 28/04 old -> setSelectedProject(user.project);
      setSelectedProject(projectOptions.find(option => option.value === user.project) || null); // Commit maj du projet sélectionné
    }).catch(onError);
  };

  /**
   * Check if the current operator has administrative rights or is a normal member
   */
  const isPrivileged = (): boolean => {
    return (currentUser?.role === 'admin' || currentUser?.role === 'manager');
  };

  /**
   * Apply coupon to current cart
   */
  const applyCoupon = (coupon?: Coupon): void => {
    if (coupon !== cart.coupon) {
      setCart({ ...cart, coupon });
    }
  };

  /**
   * Commit 28/04 new handle project selection for normal users
   */
  const onChangeProject = (v: SelectOption<string> | null) => {
    setSelectedProject(v);
    setNoProjectError(false); // Réinitialiser l'erreur si un projet est sélectionné
  };

  return (
    <div className='store-cart'>
      <div className="store-cart-list">
        {cart && cartIsEmpty() && <p>{t('app.public.store_cart.cart_is_empty')}</p>}
        {cart && cart.order_items_attributes && cart.order_items_attributes.map(item => {
          if (item.orderable_type === 'Product') {
            return (
              <CartOrderProduct item={item as OrderProduct}
                                key={item.id}
                                className="store-cart-list-item"
                                cartErrors={cartErrors}
                                cart={cart}
                                setCart={setCart}
                                reloadCart={reloadCart}
                                onError={onError}
                                privilegedOperator={isPrivileged()} />
            );
          }
          return (
            <CartOrderReservation item={item as OrderCartItemReservation}
                                  key={item.id}
                                  className="store-cart-list-item"
                                  cartErrors={cartErrors}
                                  cart={cart}
                                  reloadCart={reloadCart}
                                  setCart={setCart}
                                  onError={onError}
                                  privilegedOperator={isPrivileged()} />
          );
        })}
      </div>

      <div className="group">
        {cart && !cartIsEmpty() &&
          <div className='store-cart-info'>
            <h3>{t('app.public.store_cart.pickup')}</h3>
            <p dangerouslySetInnerHTML={{ __html: withdrawalInstructions }} />
          </div>
        }
        {/*
        {cart && !cartIsEmpty() &&
          <div className='store-cart-coupon'>
            <CouponInput user={cart.user as User} amount={cart.total} onChange={applyCoupon} />
          </div>
        }

        {cart && !cartIsEmpty() &&
          <div className="store-cart-info">
            <h3>Déroulement du prêt :</h3>
            <ul><li><p>Confirmation du prêt :</p></li></ul>
            <p>Une fois votre commande passée et votre prêt validé lors du rendez-vous, vous recevrez un email de confirmation pour vous assurer que tout est en ordre.</p>
            <ul><li><p>Rappel avant la fin du délai :</p></li></ul>
            <p>Une semaine avant l&apos;écoulement du délai de prêt, nous vous enverrons un email pour vous rappeler de retourner l&apos;article.</p>
            <ul><li><p>Notification en cas d&apos;annulation:</p></li></ul>
            <p>Si votre prêt est annulé pour une raison quelconque, vous serez immédiatement informé par email.</p>
          </div>
        }
        */}
      </div>
      <aside>
        {cart && !cartIsEmpty() && isPrivileged() &&
          <MemberSelect onSelected={handleChangeMember} defaultUser={cart.user as User} hasError={noMemberError} />
        }

        {cart && !cartIsEmpty() && // isPrivileged() && // Commit liste déroulante pour les utilisateurs admin
          <div className={`project-select ${noProjectError ? 'error' : ''}`} style={{ marginBottom: '20px' }}>
            <div className="project-select-header">
              <h3 className="project-select-title">{t('app.public.store_cart.select_project')}</h3>
            </div>
            <Select
              placeholder={t('app.public.store_cart.select_project')}
              className="select-input"
              options={projectOptions}
              onChange={onChangeProject}
              value={selectedProject}
            />
          </div>
        }

         {cart && !cartIsEmpty() && <>
          <FabButton className='checkout-btn' onClick={checkout}>
            {t('app.public.store_cart.checkout')}
          </FabButton>
        </>}
      </aside>

      {cart && !cartIsEmpty() && cart.user && <div>
        <PaymentModal isOpen={paymentModal}
          toggleModal={togglePaymentModal}
          afterSuccess={handlePaymentSuccess}
          onError={onError}
          cart={{ customer_id: cart.user.id, items: [], payment_method: PaymentMethod.Card, project: selectedProject?.value || '' }}
          order={cart}
          operator={currentUser}
          customer={cart.user as User}
          updateCart={() => 'dont need update shopping cart'} />
      </div>}
    </div>
  );
};

const StoreCartWrapper: React.FC<StoreCartProps> = (props) => {
  return (
    <Loader>
      <StoreCart {...props} />
    </Loader>
  );
};

Application.Components.component('storeCart', react2angular(StoreCartWrapper, ['onSuccess', 'onError', 'currentUser', 'userLogin']));
