(function ($) {
    'use strict';

    const documentReady = function (callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    };

    documentReady(function () {
        const config = window.tillPaymentsInlineConfig || {};
        const integrationKey = config.integrationKey || null;
        const gatewayId = config.gatewayId || '';
        const $seamlessForm = $('#till_payments_seamless');

        if (!integrationKey || !$seamlessForm.length) {
            return;
        }

        const $paymentForm = $seamlessForm.closest('form');
        const $placeOrderButton = $paymentForm.find('#place_order');
        const $tokenInput = $('#till_payments_token');
        const $errorContainer = $('#till_payments_errors');
        const $loader = $('#till_payments_loader');
        const $cardHolderInput = $('#till_payments_seamless_card_holder');
        const $expiryInput = $('#till_payments_seamless_expiry');

        if (!$paymentForm.length || !$placeOrderButton.length || !$tokenInput.length) {
            return;
        }

        const state = {
            initialized: false,
            isProcessing: false,
            allowSubmit: false,
            validNumber: false,
            validCvv: false,
        };

        const isGatewaySelected = function () {
            if (!gatewayId) {
                return true;
            }

            const $methodInput = $(
                'input[name="payment_method"][value="' + gatewayId + '"]'
            );

            return !$methodInput.length || $methodInput.is(':checked');
        };

        const isFormVisible = function () {
            const $box = $seamlessForm.closest('.payment_box');
            return $box.length ? $box.is(':visible') : $seamlessForm.is(':visible');
        };

        const shouldHandle = function () {
            return (
                integrationKey &&
                state &&
                isGatewaySelected() &&
                isFormVisible()
            );
        };

        const toggleLoader = function (active) {
            if (!$loader.length) {
                return;
            }

            $loader.toggleClass('is-active', Boolean(active));
        };

        const togglePlaceOrder = function (disabled) {
            if (!shouldHandle()) {
                $placeOrderButton.prop('disabled', false);
                return;
            }

            $placeOrderButton.prop('disabled', Boolean(disabled));
        };

        const clearErrors = function () {
            $errorContainer.empty();
        };

        const displayErrors = function (messages) {
            clearErrors();

            if (!messages || !messages.length) {
                return;
            }

            const $list = $('<ul/>', { class: 'till-payments-error-list' });
            messages.forEach(function (message) {
                if (message) {
                    $('<li/>').text(message).appendTo($list);
                }
            });

            if ($list.children().length) {
                $errorContainer.append($list);
            }
        };

        const waitForScript = function (selector) {
            return new Promise(function (resolve, reject) {
                let attempts = 0;
                const maxAttempts = 50;

                const findScript = function () {
                    if (document.querySelector(selector)) {
                        if (typeof window.PaymentJs !== 'function') {
                            reject(new Error('Payment library unavailable.'));
                            return;
                        }
                        resolve(new window.PaymentJs('1.3'));
                        return;
                    }

                    if (attempts >= maxAttempts) {
                        reject(new Error('Payment script failed to load.'));
                        return;
                    }

                    attempts += 1;
                    setTimeout(findScript, 100);
                };

                findScript();
            });
        };

        const formatExpiryValue = function (value) {
            const digits = String(value || '')
                .replace(/[^0-9]/g, '')
                .slice(0, 4);

            if (!digits.length) {
                return '';
            }

            if (digits.length <= 2) {
                return digits;
            }

            return digits.slice(0, 2) + '/' + digits.slice(2);
        };

        const padExpiry = function (month, year) {
            const mm = ('0' + String(month || '')).slice(-2);
            const yy = String(year || '').slice(-2);

            if (!mm || !yy) {
                return '';
            }

            return mm + '/' + yy;
        };

        const validate = function () {
            if (!shouldHandle()) {
                togglePlaceOrder(false);
                state.allowSubmit = false;
                return false;
            }

            if (!state.initialized) {
                togglePlaceOrder(true);
                state.allowSubmit = false;
                return false;
            }

            const holderFilled = $.trim($cardHolderInput.val()).length > 1;
            const expiryValue = $expiryInput.val();
            const expiryValid = /^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(expiryValue);
            const formValid =
                state.validNumber &&
                state.validCvv &&
                holderFilled &&
                expiryValid;

            togglePlaceOrder(!formValid);
            state.allowSubmit = formValid;

            return formValid;
        };

        const seamless = {
            payment: null,
            async init() {
                if (state.initialized) {
                    return;
                }

                const paymentInstance = await waitForScript('[data-main="payment-js"]');
                const style = {
                    border: $cardHolderInput.css('border') || '1px solid #d5d8dc',
                    borderRadius: $cardHolderInput.css('border-radius') || '4px',
                    height: $cardHolderInput.outerHeight() + 'px',
                    padding: $cardHolderInput.css('padding') || '14px 12px',
                    fontSize: $cardHolderInput.css('font-size') || '16px',
                    fontWeight: $cardHolderInput.css('font-weight') || '400',
                    fontFamily: $cardHolderInput.css('font-family') || 'inherit',
                    color: $cardHolderInput.css('color') || '#1f2d3d',
                    background: $cardHolderInput.css('background-color') || '#fff',
                    letterSpacing: '0.1px',
                    wordSpacing: '1.7px',
                };

                return new Promise(function (resolve, reject) {
                    paymentInstance.init(
                        integrationKey,
                        'till_payments_seamless_card_number',
                        'till_payments_seamless_cvv',
                        function (api) {
                            seamless.payment = api;
                            api.enableAutofill();
                            api.onAutofill(function (data) {
                                if (data && data.card_holder) {
                                    $cardHolderInput.val(data.card_holder);
                                }
                                if (data && data.month && data.year) {
                                    $expiryInput.val(
                                        padExpiry(data.month, data.year)
                                    );
                                }
                                validate();
                            });
                            api.setNumberStyle(style);
                            api.setCvvStyle(style);
                            api.numberOn('input', function (data) {
                                state.validNumber = Boolean(data.validNumber);
                                validate();
                            });
                            api.cvvOn('input', function (data) {
                                state.validCvv = Boolean(data.validCvv);
                                validate();
                            });
                            state.initialized = true;
                            $seamlessForm.removeAttr('hidden');
                            resolve();
                        },
                        function (error) {
                            reject(error || new Error('Card initialisation failed.'));
                        }
                    );
                });
            },
            tokenize() {
                if (!this.payment) {
                    return Promise.reject([
                        'Payment form is not ready yet. Please wait a moment and try again.',
                    ]);
                }

                const expiryParts = ($expiryInput.val() || '').split('/');

                return new Promise(function (resolve, reject) {
                    seamless.payment.tokenize(
                        {
                            card_holder: $.trim($cardHolderInput.val()),
                            month: expiryParts[0],
                            year: expiryParts[1],
                            email: $.trim($('#billing_email').val() || ''),
                        },
                        function (token) {
                            resolve(token);
                        },
                        function (errors) {
                            const messages = (errors || []).map(function (error) {
                                return error && error.message
                                    ? error.message
                                    : 'Unable to tokenise card details.';
                            });
                            reject(messages);
                        }
                    );
                });
            },
        };

        const resetToken = function () {
            $tokenInput.val('');
            state.allowSubmit = false;
        };

        $cardHolderInput.on('input.tillpayments', validate);
        $expiryInput.on('input.tillpayments', function (event) {
            const formatted = formatExpiryValue(event.target.value);
            if (formatted !== event.target.value) {
                event.target.value = formatted;
            }
            validate();
        });

        $('input[name="payment_method"]').on('change.tillpayments', function () {
            resetToken();
            validate();
        });

        $(document.body).on(
            'updated_checkout payment_method_selected',
            function () {
                validate();
            }
        );

        $paymentForm.on('submit.tillpayments', function (event) {
            if (!shouldHandle()) {
                state.allowSubmit = false;
                return true;
            }

            if (state.allowSubmit) {
                state.allowSubmit = false;
                return true;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            $placeOrderButton.trigger('click');
            return false;
        });

        $placeOrderButton.on('click.tillpayments', function (event) {
            if (!shouldHandle()) {
                return true;
            }

            if (state.isProcessing) {
                event.preventDefault();
                return false;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            clearErrors();
            togglePlaceOrder(true);
            toggleLoader(true);
            state.isProcessing = true;

            seamless
                .tokenize()
                .then(function (token) {
                    $tokenInput.val(token);
                    state.isProcessing = false;
                    toggleLoader(false);
                    togglePlaceOrder(false);
                    state.allowSubmit = true;
                    $paymentForm.trigger('submit');
                })
                .catch(function (messages) {
                    state.isProcessing = false;
                    toggleLoader(false);
                    togglePlaceOrder(false);
                    displayErrors(messages);
                });

            return false;
        });

        (async function bootstrap() {
            try {
                if (shouldHandle()) {
                    togglePlaceOrder(true);
                }
                toggleLoader(true);
                await seamless.init();
            } catch (error) {
                const message = error && error.message ? error.message : error;
                displayErrors([message || 'Failed to prepare payment form.']);
            } finally {
                toggleLoader(false);
                validate();
            }
        })();
    });
})(jQuery);

					
					// remove WP injected br tags 
					const paymentBoxes = document.querySelectorAll('#payment > ul > li > div > div.payment_box');
					paymentBoxes.forEach(box => {
						const brTags = box.querySelectorAll('br');
						brTags.forEach(br => {
							br.remove();
						});
					});

	                payment.enableAutofill();
	                payment.onAutofill(function(data) {
	                  $('#till_payments_seamless_card_holder').val(data.card_holder);
	                  $('#till_payments_seamless_expiry').val(data.month+"/"+data.year);
	                }
	                );
	                    payment.setNumberStyle(style);
	                    payment.setCvvStyle(style);
	                    payment.numberOn('input', function (data) {
	                        validNumber = data.validNumber;
	                        validate();
	                    });
	                    payment.cvvOn('input', function (data) {
	                        validCvv = data.validCvv;
	                        validate();
	                    });
	            });
	            })
	            .catch(e => {console.log(e)})
	            $('input, select', $seamlessForm).on('input', validate);
	        };
	        var validate = function () {
	            $tillPaymentsErrors.html('');
	            //$('.form-row', $seamlessForm).removeClass('woocommerce-invalid');
	            //$seamlessCardNumberInput.closest('.form-row').toggleClass('woocommerce-invalid', !validNumber);
	            //$seamlessCvvInput.closest('.form-row').toggleClass('woocommerce-invalid', !validCvv);
	            validDetails = true;
	            if (!$seamlessCardHolderInput.val().length) {
	                //$seamlessCardHolderInput.closest('.form-row').addClass('woocommerce-invalid');
	                validDetails = false;
	            }
	            if (!$seamlessExpiryInput.val().length) {
	                //$seamlessExpiryInput.closest('.form-row').addClass('woocommerce-invalid');
	                validDetails = false;
	            }
	            if (validNumber && validCvv && validDetails) {
	                _validCallback.call();
	                return;
	            }
	            // _invalidCallback.call();
	        };
	        var reset = function () {
	            $seamlessForm.hide();
	        };
	        // add in forward slash to mm/yy
	        function onExpiryInputChange(e) {
	            if (e.target.value.length > 2 && !e.target.value.includes("/")) {
	                document.getElementById("till_payments_seamless_expiry").value = e.target.value.slice(0, 2) + "/" + e.target.value.slice(2)
	            }
	        }
	        document.getElementById("till_payments_seamless_expiry").addEventListener("input", onExpiryInputChange);
	        // hide loader
	        function removeLoader() {
	            document.getElementById("loader").style.display = "none";
	        };
	        window.onload = function () {
	            document.querySelector("iframe").addEventListener("load", removeLoader());
	        }
	        var submit = function (success, error) {
	            var expiryData = $seamlessExpiryInput.val().split('/');
	            payment.tokenize({
	                    card_holder: $seamlessCardHolderInput.val(),
	                    month: expiryData[0],
	                    year: expiryData[1],
	                    email: $seamlessEmailInput.val()
	                },
	                function (token, cardData) {
	                    success.call(this, token);
	                },
	                function (errors) {
	                    error.call(this, errors);
	                }
	            );
	        };
	        return {
	            init: init,
	            reset: reset,
	            submit: submit,
	        };
	    }();
	    init();
	});
})(jQuery);