import { useTranslation } from 'react-i18next';

const fmt = (n) => Number(n || 0).toFixed(2);

export default function POSPaymentPanel({ paymentModes, total, value, onChange, disabled }) {
  const { t } = useTranslation();
  const modes = paymentModes?.length ? paymentModes : [{ name: 'Cash' }, { name: 'Card' }];
  const cashName = modes.find((m) => /cash/i.test(m.name))?.name || 'Cash';
  const cardName = modes.find((m) => /card|bank|visa/i.test(m.name))?.name || modes[1]?.name || 'Card';

  const set = (patch) => onChange({ ...value, ...patch });

  if (value.mode === 'split') {
    const cash = Number(value.cashAmount) || 0;
    const card = Number(value.cardAmount) || 0;
    const diff = total - cash - card;
    return (
      <div className="pos-payment">
        <div className="pos-payment__tabs">
          <button type="button" className="pos-payment__tab" disabled={disabled} onClick={() => set({ mode: 'cash', singleMode: cashName })}>{t('pos.cash')}</button>
          <button type="button" className="pos-payment__tab" disabled={disabled} onClick={() => set({ mode: 'card', singleMode: cardName })}>{t('pos.card')}</button>
          <button type="button" className="pos-payment__tab pos-payment__tab--active" disabled={disabled}>{t('pos.split')}</button>
        </div>
        <div className="pos-payment__split">
          <label>
            {cashName}
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              disabled={disabled}
              value={value.cashAmount}
              onChange={(e) => set({ cashAmount: e.target.value, cashMode: cashName })}
            />
          </label>
          <label>
            {cardName}
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              disabled={disabled}
              value={value.cardAmount}
              onChange={(e) => set({ cardAmount: e.target.value, cardMode: cardName })}
            />
          </label>
        </div>
        <p className={`pos-payment__hint ${Math.abs(diff) > 0.02 ? 'pos-payment__hint--warn' : ''}`}>
          {Math.abs(diff) <= 0.02 ? 'Balanced' : `Remaining: EGP ${fmt(diff)}`}
        </p>
      </div>
    );
  }

  const isCard = value.mode === 'card';
  return (
    <div className="pos-payment">
      <div className="pos-payment__tabs">
        <button
          type="button"
          className={`pos-payment__tab ${!isCard ? 'pos-payment__tab--active' : ''}`}
          disabled={disabled}
          onClick={() => set({ mode: 'cash', singleMode: cashName })}
        >
          {t('pos.cash')}
        </button>
        <button
          type="button"
          className={`pos-payment__tab ${isCard ? 'pos-payment__tab--active' : ''}`}
          disabled={disabled}
          onClick={() => set({ mode: 'card', singleMode: cardName })}
        >
          {t('pos.card')}
        </button>
        <button
          type="button"
          className="pos-payment__tab"
          disabled={disabled}
          onClick={() => set({
            mode: 'split',
            cashAmount: fmt(total / 2),
            cardAmount: fmt(total - total / 2),
            cashMode: cashName,
            cardMode: cardName,
          })}
        >
          {t('pos.split')}
        </button>
      </div>
      <p className="pos-payment__hint">Pay full amount via {isCard ? cardName : cashName}</p>
    </div>
  );
}
