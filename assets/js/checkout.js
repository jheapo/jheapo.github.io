// Paddle checkout for the plan cards on /license/.
//
// Configuration comes from data- attributes on #licence-checkout, which Jekyll fills
// from _config.yml (paddle.*) and _data/plans.yml. Nothing here has a default: if the
// configuration is incomplete, checkout stays disabled and the reason is logged.
//
// Prices on the cards are Paddle's formatted strings, shown as returned. No price
// arithmetic or formatting happens here.
(function () {
  'use strict';

  var TOKEN_PREFIX = { sandbox: 'test_', production: 'live_' };
  var DISPLAY_TOTALS = ['total', 'subtotal'];

  function CheckoutConfigurationError(message) {
    this.name = 'CheckoutConfigurationError';
    this.message = message;
  }
  CheckoutConfigurationError.prototype = Object.create(Error.prototype);

  function LicenceCheckout(root, errorMessage) {
    this.root = root;
    this.errorMessage = errorMessage;
    this.environment = root.dataset.paddleEnvironment;
    this.token = root.dataset.paddleToken;
    this.displayTotal = root.dataset.paddleDisplayTotal;
    this.successUrl = window.location.origin + root.dataset.successPath;
    this.cards = Array.prototype.slice.call(root.querySelectorAll('[data-price-id]'));
  }

  LicenceCheckout.prototype.start = function () {
    try {
      this.validate();
    } catch (error) {
      this.fail(error);
      return;
    }
    if (this.environment === 'sandbox') {
      Paddle.Environment.set('sandbox');
    }
    Paddle.Initialize({ token: this.token });
    Paddle.PricePreview({ items: this.items() })
      .then(this.showPrices.bind(this))
      .catch(this.fail.bind(this));
  };

  LicenceCheckout.prototype.validate = function () {
    if (typeof Paddle === 'undefined') {
      throw new CheckoutConfigurationError('Paddle.js did not load.');
    }
    var prefix = TOKEN_PREFIX[this.environment];
    if (!prefix) {
      throw new CheckoutConfigurationError('paddle.environment must be sandbox or production, found "' +
        this.environment + '".');
    }
    if (!this.token || this.token.indexOf(prefix) !== 0) {
      throw new CheckoutConfigurationError('paddle.client_token must be a ' + this.environment +
        ' client-side token (' + prefix + '...).');
    }
    if (DISPLAY_TOTALS.indexOf(this.displayTotal) < 0) {
      throw new CheckoutConfigurationError('paddle.display_total must be total or subtotal, found "' +
        this.displayTotal + '".');
    }
    if (this.cards.length === 0) {
      throw new CheckoutConfigurationError('No plans found in _data/plans.yml.');
    }
    this.cards.forEach(function (card) {
      if (!card.dataset.priceId) {
        throw new CheckoutConfigurationError('A plan has no ' + this.environment +
          ' price ID in _data/plans.yml.');
      }
    }, this);
  };

  LicenceCheckout.prototype.items = function () {
    return this.cards.map(function (card) {
      return { priceId: card.dataset.priceId, quantity: 1 };
    });
  };

  LicenceCheckout.prototype.showPrices = function (preview) {
    var lineItems = preview.data.details.lineItems;
    this.cards.forEach(function (card) {
      var lineItem = lineItems.find(function (item) { return item.price.id === card.dataset.priceId; });
      if (!lineItem) {
        throw new Error('Paddle returned no price for ' + card.dataset.priceId + '.');
      }
      card.querySelector('[data-price]').textContent = lineItem.formattedTotals[this.displayTotal];
    }, this);
    this.cards.forEach(this.enableBuy, this);
  };

  LicenceCheckout.prototype.enableBuy = function (card) {
    var button = card.querySelector('[data-buy]');
    button.addEventListener('click', this.openCheckout.bind(this, card.dataset.priceId));
    button.disabled = false;
  };

  LicenceCheckout.prototype.openCheckout = function (priceId) {
    // quantity is the number of seats; the buyer can change it in the overlay.
    Paddle.Checkout.open({
      items: [{ priceId: priceId, quantity: 1 }],
      settings: { displayMode: 'overlay', variant: 'one-page', successUrl: this.successUrl }
    });
  };

  LicenceCheckout.prototype.fail = function (error) {
    console.error('Licence checkout unavailable:', error);
    this.errorMessage.hidden = false;
  };

  var root = document.getElementById('licence-checkout');
  if (root) {
    new LicenceCheckout(root, document.getElementById('checkout-error')).start();
  }
})();
