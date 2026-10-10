/* @ds-bundle: {"format":4,"namespace":"WarmMinimalDesignSystem_58386e","components":[{"name":"Button","sourcePath":"components/controls/Button.jsx"},{"name":"Checkbox","sourcePath":"components/controls/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/controls/IconButton.jsx"},{"name":"SaveButton","sourcePath":"components/controls/SaveButton.jsx"},{"name":"Segmented","sourcePath":"components/controls/Segmented.jsx"},{"name":"Toggle","sourcePath":"components/controls/Toggle.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Chip","sourcePath":"components/display/Chip.jsx"},{"name":"DashedAdd","sourcePath":"components/display/DashedAdd.jsx"},{"name":"EmptyState","sourcePath":"components/display/EmptyState.jsx"},{"name":"Eyebrow","sourcePath":"components/display/Eyebrow.jsx"},{"name":"Icon","sourcePath":"components/display/Icon.jsx"},{"name":"Field","sourcePath":"components/fields/Field.jsx"},{"name":"Input","sourcePath":"components/fields/Input.jsx"},{"name":"SearchInput","sourcePath":"components/fields/SearchInput.jsx"},{"name":"Select","sourcePath":"components/fields/Select.jsx"},{"name":"Textarea","sourcePath":"components/fields/Textarea.jsx"},{"name":"FIELD_H","sourcePath":"components/fields/fieldStyle.js"},{"name":"LABEL","sourcePath":"components/fields/fieldStyle.js"},{"name":"ERROR","sourcePath":"components/fields/fieldStyle.js"},{"name":"CategoryRail","sourcePath":"components/lists/CategoryRail.jsx"},{"name":"LedgerRow","sourcePath":"components/lists/LedgerRow.jsx"},{"name":"LedgerTable","sourcePath":"components/lists/LedgerTable.jsx"},{"name":"RailRow","sourcePath":"components/lists/RailRow.jsx"},{"name":"CommitBlock","sourcePath":"components/live/CommitBlock.jsx"},{"name":"ResultRow","sourcePath":"components/live/ResultRow.jsx"},{"name":"ClickTooltip","sourcePath":"components/overlays/ClickTooltip.jsx"},{"name":"ConfirmDialog","sourcePath":"components/overlays/ConfirmDialog.jsx"},{"name":"ModalDialog","sourcePath":"components/overlays/ModalDialog.jsx"},{"name":"NotificationToastCard","sourcePath":"components/overlays/NotificationToastCard.jsx"},{"name":"Breadcrumb","sourcePath":"components/shell/Breadcrumb.jsx"},{"name":"HeaderDivider","sourcePath":"components/shell/HeaderDivider.jsx"},{"name":"PageHeader","sourcePath":"components/shell/PageHeader.jsx"},{"name":"TopBar","sourcePath":"components/shell/TopBar.jsx"},{"name":"EASE","sourcePath":"components/util.js"},{"name":"T","sourcePath":"components/util.js"},{"name":"RING","sourcePath":"components/util.js"}],"sourceHashes":{"components/controls/Button.jsx":"c9b21be16a57","components/controls/Checkbox.jsx":"facce7d73ad3","components/controls/IconButton.jsx":"9d7a72a8640c","components/controls/SaveButton.jsx":"beb4df6b713d","components/controls/Segmented.jsx":"e21d35cc0510","components/controls/Toggle.jsx":"6428d447d945","components/display/Card.jsx":"c06f497e873c","components/display/Chip.jsx":"00b8757bf559","components/display/DashedAdd.jsx":"521cdba154a3","components/display/EmptyState.jsx":"28e357207307","components/display/Eyebrow.jsx":"f0fb309a0ef6","components/display/Icon.jsx":"283010b23ff1","components/fields/Field.jsx":"c4cf0995b99f","components/fields/Input.jsx":"7433eadaa474","components/fields/SearchInput.jsx":"b58985955973","components/fields/Select.jsx":"7cb150144e39","components/fields/Textarea.jsx":"7c3218514e1e","components/fields/fieldStyle.js":"1ca6bc5b96fc","components/lists/CategoryRail.jsx":"868de156ee76","components/lists/LedgerRow.jsx":"19fd9be28a53","components/lists/LedgerTable.jsx":"8d2d8b178bec","components/lists/RailRow.jsx":"7296fd9b4b6f","components/live/CommitBlock.jsx":"32cf173aeb65","components/live/ResultRow.jsx":"f10f94340713","components/overlays/ClickTooltip.jsx":"cead44cf6e88","components/overlays/ConfirmDialog.jsx":"789cee5272cc","components/overlays/ModalDialog.jsx":"6643fbea13e7","components/overlays/NotificationToastCard.jsx":"2157c540ec4d","components/shell/Breadcrumb.jsx":"00782799b82c","components/shell/HeaderDivider.jsx":"69f00e925db0","components/shell/PageHeader.jsx":"7a16b12fc3ad","components/shell/TopBar.jsx":"49c54248856d","components/util.js":"16a0660a2bf3","ui_kits/cost-estimator/AppChrome.jsx":"89a1e2e4276e","ui_kits/cost-estimator/CalculatorsScreen.jsx":"1a64721e3fe5","ui_kits/cost-estimator/LineForm.jsx":"9e1eb93e76bd","ui_kits/cost-estimator/MaterialsScreen.jsx":"49f9a98181b2","ui_kits/cost-estimator/QuoteBoardScreen.jsx":"c65e9fc0861c","ui_kits/cost-estimator/QuoteWorkspace.jsx":"1bc8c17cea96","ui_kits/cost-estimator/data.js":"fc3f5a867303"},"inlinedExternals":[],"unexposedExports":[{"name":"fieldStyle","sourcePath":"components/fields/fieldStyle.js"},{"name":"ledgerContext","sourcePath":"components/lists/LedgerTable.jsx"},{"name":"rgb","sourcePath":"components/util.js"},{"name":"useFocusVisible","sourcePath":"components/util.js"},{"name":"useHover","sourcePath":"components/util.js"}]} */

(() => {

const __ds_ns = (window.WarmMinimalDesignSystem_58386e = window.WarmMinimalDesignSystem_58386e || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/display/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Icon({
  name,
  size = 16,
  color = 'currentColor',
  style,
  ...rest
}) {
  const url = `url(https://unpkg.com/lucide-static@0.469.0/icons/${name}.svg)`;
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true"
  }, rest, {
    style: {
      display: 'inline-block',
      flex: 'none',
      width: size,
      height: size,
      background: color,
      WebkitMask: url + ' center/contain no-repeat',
      mask: url + ' center/contain no-repeat',
      ...style
    }
  }));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Icon.jsx", error: String((e && e.message) || e) }); }

// components/shell/Breadcrumb.jsx
try { (() => {
function Crumb({
  item,
  onNavigate
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: item.href || '#',
    onClick: e => {
      if (onNavigate) {
        e.preventDefault();
        onNavigate(item);
      }
    },
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      color: h ? 'rgb(var(--ink))' : 'inherit',
      textDecoration: 'none'
    }
  }, item.label);
}
function Breadcrumb({
  items = [],
  meta,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb"
  }, items.map((it, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, " / "), /*#__PURE__*/React.createElement(Crumb, {
    item: it,
    onNavigate: onNavigate
  }))), meta && /*#__PURE__*/React.createElement("span", null, " \xB7 ", meta));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/shell/HeaderDivider.jsx
try { (() => {
function HeaderDivider() {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      width: 1,
      height: 24,
      margin: '0 6px',
      background: 'rgb(var(--border))'
    }
  });
}
Object.assign(__ds_scope, { HeaderDivider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/HeaderDivider.jsx", error: String((e && e.message) || e) }); }

// components/util.js
try { (() => {
const rgb = (n, a) => a == null ? `rgb(var(--${n}))` : `rgb(var(--${n}) / ${a})`;
const EASE = 'cubic-bezier(.4,0,.2,1)';
const T = ['background-color', 'color', 'opacity', 'box-shadow', 'border-color'].map(p => p + ' 150ms ' + EASE).join(', ');
const RING = '0 0 0 2px rgb(var(--accent))';
function useHover() {
  const [h, setH] = React.useState(false);
  return [h, {
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false)
  }];
}
function useFocusVisible() {
  const [f, setF] = React.useState(false);
  return [f, {
    onFocus: e => {
      let v = true;
      try {
        v = e.target.matches(':focus-visible');
      } catch (x) {}
      setF(v);
    },
    onBlur: () => setF(false)
  }];
}
Object.assign(__ds_scope, { rgb, EASE, T, RING, useHover, useFocusVisible });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/util.js", error: String((e && e.message) || e) }); }

// components/controls/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const iconNode = (icon, size) => typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
  name: icon,
  size: size
}) : icon;
const VARIANTS = {
  accent: {
    bg: __ds_scope.rgb('accent'),
    fg: __ds_scope.rgb('accent-ink'),
    hover: {
      opacity: 0.9
    }
  },
  primary: {
    bg: __ds_scope.rgb('action-solid'),
    fg: __ds_scope.rgb('on-accent'),
    hover: {
      opacity: 0.85
    }
  },
  secondary: {
    bg: 'transparent',
    fg: __ds_scope.rgb('ink'),
    border: __ds_scope.rgb('border-strong'),
    hover: {
      background: 'var(--surface-hover)'
    }
  },
  ghost: {
    bg: 'transparent',
    fg: __ds_scope.rgb('ink-muted'),
    hover: {
      color: __ds_scope.rgb('ink')
    }
  },
  danger: {
    bg: 'transparent',
    fg: __ds_scope.rgb('danger'),
    hover: {
      background: __ds_scope.rgb('danger-bg')
    }
  },
  inverse: {
    bg: __ds_scope.rgb('on-inverse'),
    fg: __ds_scope.rgb('inverse'),
    hover: {
      opacity: 0.9
    }
  }
};
const SIZES = {
  sm: [32, 12, 12, 16],
  md: [36, 14, 13, 18],
  lg: [44, 18, 14, 20]
};
function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  disabled,
  type = 'button',
  style,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, fp] = __ds_scope.useFocusVisible();
  const v = VARIANTS[variant] || VARIANTS.primary;
  const [h, px, fs, lh] = SIZES[size] || SIZES.md;
  const base = {
    display: block ? 'flex' : 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: disabled ? 'transparent' : v.border || 'transparent',
    font: `600 ${fs}px/${lh}px var(--font-ui)`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: __ds_scope.T,
    background: v.bg,
    color: v.fg,
    height: block ? 46 : h,
    width: block ? '100%' : undefined,
    padding: `0 ${px}px`,
    borderRadius: block ? 'var(--radius-row)' : 'var(--radius-md)',
    boxShadow: focus ? `0 0 0 2px ${__ds_scope.rgb('canvas')}, 0 0 0 4px ${__ds_scope.rgb('accent')}` : 'none',
    outline: 'none'
  };
  const dis = disabled ? {
    background: __ds_scope.rgb('sunken'),
    color: __ds_scope.rgb('ink-faint'),
    cursor: 'not-allowed',
    opacity: 1
  } : hover ? v.hover : null;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled
  }, rest, hp, fp, {
    style: {
      ...base,
      ...dis,
      ...style
    }
  }), icon && iconNode(icon, 16), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Button.jsx", error: String((e && e.message) || e) }); }

// components/controls/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  id,
  disabled,
  style,
  ...rest
}) {
  const gen = React.useId();
  const cid = id || gen;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    id: cid,
    disabled: disabled
  }, rest, {
    style: {
      width: 16,
      height: 16,
      margin: 0,
      accentColor: __ds_scope.rgb('accent'),
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1
    }
  })), label && /*#__PURE__*/React.createElement("label", {
    htmlFor: cid,
    style: {
      marginLeft: 8,
      fontSize: 14,
      color: disabled ? __ds_scope.rgb('ink-faint') : __ds_scope.rgb('ink'),
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/controls/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const iconNode = (icon, size) => typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
  name: icon,
  size: size
}) : icon;
function IconButton({
  label,
  tooltip,
  icon,
  variant = 'default',
  size = 'md',
  disabled,
  type = 'button',
  style,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, fp] = __ds_scope.useFocusVisible();
  const d = size === 'sm' ? 28 : size === 'lg' ? 36 : 32;
  const on = hover && !disabled;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    title: tooltip ?? label,
    "aria-label": label,
    disabled: disabled
  }, rest, hp, fp, {
    style: {
      display: 'inline-flex',
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      width: d,
      height: d,
      padding: 0,
      border: 'none',
      borderRadius: 'var(--radius-md)',
      background: on ? variant === 'danger' ? __ds_scope.rgb('danger-bg') : __ds_scope.rgb('surface') : 'transparent',
      color: on ? variant === 'danger' ? __ds_scope.rgb('danger') : __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted'),
      opacity: disabled ? 0.4 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: __ds_scope.T,
      outline: 'none',
      boxShadow: focus ? __ds_scope.RING : 'none',
      ...style
    }
  }), iconNode(icon, 16));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/controls/SaveButton.jsx
try { (() => {
function SaveButton({
  dirty = false,
  onClick
}) {
  const label = dirty ? 'Save changes (⌘S)' : 'Save (⌘S)';
  return /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "accent",
    onClick: onClick,
    title: label,
    "aria-label": label,
    style: {
      position: 'relative',
      flex: 'none',
      width: 36,
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "save",
    size: 16
  }), dirty && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      right: -4,
      top: -4,
      width: 10,
      height: 10,
      borderRadius: 999,
      background: __ds_scope.rgb('ink'),
      boxShadow: '0 0 0 2px ' + __ds_scope.rgb('canvas')
    }
  }));
}
Object.assign(__ds_scope, { SaveButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/SaveButton.jsx", error: String((e && e.message) || e) }); }

// components/controls/Segmented.jsx
try { (() => {
const H = {
  compact: 32,
  md: 36,
  large: 46
};
function Seg({
  option,
  on,
  block,
  onChange
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "radio",
    "aria-checked": on,
    title: option.title,
    onClick: () => onChange && onChange(option.value),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      flex: block ? 1 : 'none',
      padding: '0 14px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid transparent',
      whiteSpace: 'nowrap',
      font: 'inherit',
      fontWeight: on ? 600 : 400,
      cursor: 'pointer',
      transition: __ds_scope.T,
      background: on ? __ds_scope.rgb('field-raised') : 'transparent',
      color: on || h ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted')
    }
  }, option.label);
}
function Segmented({
  options = [],
  value,
  onChange,
  block = false,
  size = 'md',
  mono = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-label": rest['aria-label'],
    "aria-labelledby": rest['aria-labelledby'],
    style: {
      display: block ? 'flex' : 'inline-flex',
      height: H[size] || 36,
      padding: 3,
      gap: 3,
      borderRadius: 'var(--radius-md)',
      background: __ds_scope.rgb('field'),
      fontSize: 13,
      fontFamily: mono ? 'var(--font-numeric)' : 'var(--font-ui)',
      ...style
    }
  }, options.map(o => /*#__PURE__*/React.createElement(Seg, {
    key: o.value,
    option: o,
    on: o.value === value,
    block: block,
    onChange: onChange
  })));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/controls/Toggle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Toggle({
  checked = false,
  onChange,
  label,
  meta,
  framed = true,
  disabled,
  id,
  style,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, fp] = __ds_scope.useFocusVisible();
  return /*#__PURE__*/React.createElement("button", _extends({
    id: id,
    type: "button",
    role: "switch",
    "aria-checked": checked,
    "aria-describedby": rest['aria-describedby'],
    disabled: disabled,
    onClick: () => onChange && onChange(!checked)
  }, hp, fp, {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      textAlign: 'left',
      fontSize: 15,
      color: __ds_scope.rgb('ink'),
      border: 'none',
      font: 'inherit',
      fontSize: 15,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      outline: 'none',
      boxShadow: focus ? __ds_scope.RING : 'none',
      transition: __ds_scope.T,
      ...(framed ? {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: hover ? __ds_scope.rgb('field-hover') : __ds_scope.rgb('field')
      } : {
        padding: 0,
        borderRadius: 999,
        background: 'transparent'
      }),
      ...style
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'relative',
      flex: 'none',
      width: 38,
      height: 22,
      borderRadius: 999,
      transition: __ds_scope.T,
      background: checked ? __ds_scope.rgb('accent') : framed ? __ds_scope.rgb('ink-faint', 0.5) : __ds_scope.rgb('border-strong')
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: checked ? 19 : 3,
      width: 16,
      height: 16,
      borderRadius: 999,
      background: checked ? __ds_scope.rgb('accent-ink') : __ds_scope.rgb('surface'),
      transition: 'left 150ms cubic-bezier(.4,0,.2,1)'
    }
  })), label, meta && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 13,
      color: __ds_scope.rgb('ink-muted')
    }
  }, meta));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  title,
  actions,
  interactive,
  variant = 'default',
  density = 'default',
  onClick,
  style,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const strong = variant === 'outlined' || variant === 'raised' || variant === 'overlay';
  const auto = interactive ?? Boolean(onClick);
  const pad = density === 'dense' ? 16 : density === 'roomy' ? 24 : 20;
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick
  }, rest, hp, {
    style: {
      position: 'relative',
      borderRadius: 10,
      padding: pad,
      background: auto && hover ? 'var(--surface-hover)' : __ds_scope.rgb('surface'),
      border: '1px solid ' + __ds_scope.rgb(strong ? 'border-strong' : 'border'),
      boxShadow: 'var(--shadow-card)',
      cursor: auto ? 'pointer' : undefined,
      transition: __ds_scope.T,
      ...style
    }
  }), (title || actions) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 600,
      letterSpacing: '-0.025em',
      color: __ds_scope.rgb('ink')
    }
  }, title), actions && /*#__PURE__*/React.createElement("div", null, actions)), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: [11, '2px 8px'],
  md: [12, '4px 10px'],
  lg: [14, '6px 12px']
};
const V = {
  default: [__ds_scope.rgb('sunken'), 'var(--ink-body)'],
  flat: [__ds_scope.rgb('sunken'), 'var(--ink-body)'],
  muted: [__ds_scope.rgb('sunken'), __ds_scope.rgb('ink-muted')],
  primary: [__ds_scope.rgb('action-solid'), __ds_scope.rgb('on-accent')],
  selected: [__ds_scope.rgb('inverse'), __ds_scope.rgb('on-inverse')],
  error: [__ds_scope.rgb('danger'), __ds_scope.rgb('on-accent')],
  primaryTonal: [__ds_scope.rgb('action-bg'), __ds_scope.rgb('ink')],
  errorTonal: [__ds_scope.rgb('danger-bg'), __ds_scope.rgb('danger')],
  success: [__ds_scope.rgb('committed-bg'), __ds_scope.rgb('committed')],
  outline: [__ds_scope.rgb('surface'), 'var(--ink-body)', 'solid'],
  dashed: [__ds_scope.rgb('surface'), 'var(--ink-body)', 'dashed'],
  ghost: ['transparent', 'var(--ink-body)', 'ghost']
};
function Chip({
  children,
  size = 'md',
  variant = 'default',
  leadingIcon,
  trailingIcon,
  disabled,
  onClick,
  style,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [fs, pad] = SIZES[size] || SIZES.md;
  const [bg, fg, b] = V[variant] || V.default;
  const Tag = onClick ? 'button' : 'div';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    type: onClick ? 'button' : undefined,
    onClick: onClick,
    disabled: onClick ? disabled : undefined
  }, rest, hp, {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontWeight: 500,
      fontSize: fs,
      lineHeight: fs === 11 ? '16px' : fs === 12 ? '16px' : '20px',
      padding: pad,
      borderRadius: 999,
      userSelect: 'none',
      fontFamily: 'inherit',
      background: b === 'ghost' && hover ? 'var(--surface-hover)' : bg,
      color: fg,
      border: b === 'solid' || b === 'dashed' ? `1px ${b} ${__ds_scope.rgb('border-strong')}` : b === 'ghost' ? '1px solid transparent' : 'none',
      cursor: onClick ? disabled ? 'not-allowed' : 'pointer' : undefined,
      opacity: disabled ? onClick ? 0.5 : 0.6 : onClick && hover ? 0.8 : 1,
      transition: 'opacity 150ms',
      ...style
    }
  }), leadingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flex: 'none'
    }
  }, leadingIcon), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, children), trailingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flex: 'none'
    }
  }, trailingIcon));
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Chip.jsx", error: String((e && e.message) || e) }); }

// components/display/DashedAdd.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function DashedAdd({
  onClick,
  radius = 'row',
  children,
  style
}) {
  const [hover, hp] = __ds_scope.useHover();
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick
  }, hp, {
    style: {
      width: '100%',
      padding: 11,
      border: '1px dashed ' + __ds_scope.rgb('border-strong'),
      textAlign: 'center',
      fontSize: 13,
      lineHeight: '20px',
      fontFamily: 'inherit',
      cursor: 'pointer',
      transition: __ds_scope.T,
      borderRadius: radius === 'lg' ? 12 : 10,
      background: hover ? 'var(--surface-hover)' : 'transparent',
      color: hover ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted'),
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { DashedAdd });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/DashedAdd.jsx", error: String((e && e.message) || e) }); }

// components/display/EmptyState.jsx
try { (() => {
const S = {
  small: [56, 28, 56],
  medium: [64, 32, 64],
  large: [80, 40, 80]
};
function EmptyState({
  icon,
  title,
  description,
  actions,
  iconSize = 'large'
}) {
  const [box, ic, py] = S[iconSize] || S.large;
  return /*#__PURE__*/React.createElement(__ds_scope.Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: py + 'px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: box,
      height: box,
      borderRadius: 999,
      background: __ds_scope.rgb('sunken'),
      marginBottom: 16
    }
  }, typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: ic,
    color: __ds_scope.rgb('ink-muted')
  }) : icon), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 4px',
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 600,
      color: __ds_scope.rgb('ink')
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 auto 20px',
      maxWidth: 448,
      fontSize: 14,
      lineHeight: '20px',
      color: __ds_scope.rgb('ink-muted')
    }
  }, description), actions));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/display/Eyebrow.jsx
try { (() => {
function Eyebrow({
  tone = 'faint',
  tracking = 'section',
  as: Tag = 'div',
  id,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement(Tag, {
    id: id,
    style: {
      margin: 0,
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      lineHeight: '16px',
      textTransform: 'uppercase',
      fontWeight: tone === 'live' ? 600 : 400,
      letterSpacing: tracking === 'meta' ? '.04em' : '.06em',
      color: tone === 'live' ? __ds_scope.rgb('committed') : tone === 'ink' ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-faint'),
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/fields/Field.jsx
try { (() => {
function Field({
  label,
  unit,
  hint,
  error,
  span = 1,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 0,
      gridColumn: span > 1 ? 'span ' + span : undefined,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      lineHeight: '16px',
      color: __ds_scope.rgb('ink-muted')
    }
  }, label, unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-numeric)',
      color: __ds_scope.rgb('ink-faint')
    }
  }, " ", unit)), children, (error || hint) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      lineHeight: '16px',
      color: error ? __ds_scope.rgb('danger') : __ds_scope.rgb('ink-faint')
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fields/Field.jsx", error: String((e && e.message) || e) }); }

// components/fields/fieldStyle.js
try { (() => {
const FIELD_H = {
  compact: [38, 14],
  md: [42, 15],
  large: [46, 16]
};
function fieldStyle({
  error,
  hover,
  focus,
  disabled
}) {
  return {
    width: '100%',
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    outline: 'none',
    color: disabled ? __ds_scope.rgb('ink-faint') : __ds_scope.rgb('ink'),
    caretColor: __ds_scope.rgb('accent'),
    transition: __ds_scope.T,
    background: disabled ? 'var(--sunken-2)' : hover || focus ? __ds_scope.rgb('field-hover') : __ds_scope.rgb('field'),
    cursor: disabled ? 'not-allowed' : undefined,
    boxShadow: error ? focus ? 'var(--field-error-focus)' : 'var(--field-error)' : focus ? 'var(--field-focus)' : 'none'
  };
}
const LABEL = {
  display: 'block',
  fontSize: 12,
  lineHeight: '16px',
  color: __ds_scope.rgb('ink-muted'),
  marginBottom: 6
};
const ERROR = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: '16px',
  color: __ds_scope.rgb('danger'),
  marginBottom: 0
};
Object.assign(__ds_scope, { FIELD_H, fieldStyle, LABEL, ERROR });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fields/fieldStyle.js", error: String((e && e.message) || e) }); }

// components/fields/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  error,
  id,
  size = 'md',
  numeric,
  type = 'text',
  disabled,
  style,
  onFocus,
  onBlur,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, setFocus] = React.useState(false);
  const gen = React.useId();
  const iid = id || gen;
  const mono = numeric ?? type === 'number';
  const [h, fs] = __ds_scope.FIELD_H[size] || __ds_scope.FIELD_H.md;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: iid,
    style: __ds_scope.LABEL
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: iid,
    type: type === 'number' ? 'text' : type,
    inputMode: type === 'number' ? 'decimal' : undefined,
    disabled: disabled,
    "aria-invalid": error ? 'true' : undefined
  }, rest, hp, {
    onFocus: e => {
      setFocus(true);
      onFocus && onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      onBlur && onBlur(e);
    },
    style: {
      ...__ds_scope.fieldStyle({
        error,
        hover,
        focus,
        disabled
      }),
      height: h,
      padding: '0 12px',
      fontSize: fs,
      fontFamily: mono ? 'var(--font-numeric)' : 'var(--font-ui)',
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      ...style
    }
  })), error && /*#__PURE__*/React.createElement("p", {
    role: "alert",
    style: __ds_scope.ERROR
  }, error));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fields/Input.jsx", error: String((e && e.message) || e) }); }

// components/fields/SearchInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SearchInput({
  value,
  onChange,
  placeholder,
  style,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 16,
    color: __ds_scope.rgb('ink-faint'),
    style: {
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("input", _extends({
    type: "search",
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    placeholder: placeholder,
    "aria-label": rest['aria-label'] ?? (placeholder || '').replace(/…$/, '')
  }, rest, hp, {
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...__ds_scope.fieldStyle({
        hover,
        focus
      }),
      height: 36,
      padding: '0 12px 0 36px',
      fontSize: 13,
      fontFamily: 'var(--font-ui)'
    }
  })));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fields/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/fields/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  error,
  options = [],
  id,
  size = 'md',
  disabled,
  style,
  onFocus,
  onBlur,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, setFocus] = React.useState(false);
  const gen = React.useId();
  const sid = id || gen;
  const [h, fs] = __ds_scope.FIELD_H[size] || __ds_scope.FIELD_H.md;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: sid,
    style: __ds_scope.LABEL
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: sid,
    disabled: disabled
  }, rest, hp, {
    onFocus: e => {
      setFocus(true);
      onFocus && onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      onBlur && onBlur(e);
    },
    style: {
      ...__ds_scope.fieldStyle({
        error,
        hover,
        focus,
        disabled
      }),
      height: h,
      padding: '0 34px 0 12px',
      fontSize: fs,
      fontFamily: 'var(--font-ui)',
      appearance: 'none',
      WebkitAppearance: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...style
    }
  }), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value,
    disabled: o.disabled
  }, o.label, o.meta ? ' · ' + o.meta : ''))), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16,
    color: __ds_scope.rgb('ink-faint'),
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none'
    }
  })), error && /*#__PURE__*/React.createElement("p", {
    role: "alert",
    style: __ds_scope.ERROR
  }, error));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fields/Select.jsx", error: String((e && e.message) || e) }); }

// components/fields/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Textarea({
  label,
  error,
  id,
  autoGrow,
  disabled,
  style,
  onFocus,
  onBlur,
  onInput,
  ...rest
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, setFocus] = React.useState(false);
  const gen = React.useId();
  const tid = id || gen;
  const ref = React.useRef(null);
  const grow = () => {
    if (autoGrow && ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };
  React.useEffect(grow, [autoGrow]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: tid,
    style: __ds_scope.LABEL
  }, label), /*#__PURE__*/React.createElement("textarea", _extends({
    ref: ref,
    id: tid,
    disabled: disabled
  }, rest, hp, {
    onInput: e => {
      grow();
      onInput && onInput(e);
    },
    onFocus: e => {
      setFocus(true);
      onFocus && onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      onBlur && onBlur(e);
    },
    style: {
      ...__ds_scope.fieldStyle({
        error,
        hover,
        focus,
        disabled
      }),
      display: 'block',
      padding: '10px 12px',
      fontSize: 14,
      lineHeight: '20px',
      fontFamily: 'var(--font-ui)',
      resize: 'none',
      overflow: autoGrow ? 'hidden' : undefined,
      ...style
    }
  })), error && /*#__PURE__*/React.createElement("p", {
    role: "alert",
    style: __ds_scope.ERROR
  }, error));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fields/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/lists/CategoryRail.jsx
try { (() => {
function Item({
  o,
  on,
  onChange
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-pressed": on,
    onClick: () => onChange(o.value),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      flexShrink: 0,
      justifyContent: 'space-between',
      gap: 12,
      padding: '9px 10px',
      borderRadius: 8,
      border: 'none',
      textAlign: 'left',
      font: 'inherit',
      fontSize: 14,
      lineHeight: '20px',
      cursor: 'pointer',
      transition: __ds_scope.T,
      background: on ? __ds_scope.rgb('surface') : 'transparent',
      color: on || h ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted'),
      fontWeight: on ? 600 : 400
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, o.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      fontWeight: 400,
      color: on ? __ds_scope.rgb('ink-faint') : undefined
    }
  }, o.count));
}
function CategoryRail({
  options = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Categories",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '16px 12px',
      borderRight: '1px solid ' + __ds_scope.rgb('border'),
      overflowY: 'auto',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Eyebrow, {
    style: {
      padding: '0 10px 8px'
    }
  }, "Category"), options.map(o => /*#__PURE__*/React.createElement(Item, {
    key: o.label,
    o: o,
    on: o.value === value,
    onChange: onChange
  })));
}
Object.assign(__ds_scope, { CategoryRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/lists/CategoryRail.jsx", error: String((e && e.message) || e) }); }

// components/lists/LedgerTable.jsx
try { (() => {
const ledgerContext = React.createContext({
  template: '',
  aligns: []
});
function LedgerTable({
  columns = [],
  children,
  style
}) {
  const template = columns.map(c => c.width || 'minmax(0,1fr)').join(' ');
  const aligns = columns.map(c => c.align || 'left');
  return /*#__PURE__*/React.createElement(ledgerContext.Provider, {
    value: {
      template,
      aligns
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "table",
    style: {
      display: 'flex',
      flexDirection: 'column',
      color: __ds_scope.rgb('ink'),
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "row",
    style: {
      display: 'grid',
      gridTemplateColumns: template,
      gap: 16,
      padding: '0 14px 10px',
      borderBottom: '1px solid ' + __ds_scope.rgb('border'),
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      lineHeight: '16px',
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: __ds_scope.rgb('ink-faint')
    }
  }, columns.map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    role: "columnheader",
    style: {
      textAlign: aligns[i]
    }
  }, c.label))), children));
}
Object.assign(__ds_scope, { ledgerContext, LedgerTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/lists/LedgerTable.jsx", error: String((e && e.message) || e) }); }

// components/lists/LedgerRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function LedgerRow({
  cells = [],
  selected = false,
  onClick,
  hoverCell,
  style
}) {
  const {
    template,
    aligns
  } = React.useContext(__ds_scope.ledgerContext);
  const [hover, hp] = __ds_scope.useHover();
  const lift = selected || hover;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "row",
    "aria-selected": onClick ? selected : undefined,
    onClick: onClick
  }, hp, {
    style: {
      display: 'grid',
      gridTemplateColumns: template,
      gap: 16,
      alignItems: 'center',
      padding: 14,
      borderBottom: '1px solid ' + __ds_scope.rgb('border'),
      fontSize: 14,
      lineHeight: '20px',
      background: lift ? __ds_scope.rgb('surface') : 'transparent',
      borderRadius: lift ? 8 : 0,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background-color 150ms ' + __ds_scope.EASE,
      ...style
    }
  }), cells.map((cell, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    role: "cell",
    style: {
      minWidth: 0,
      textAlign: aligns[i] || 'left'
    }
  }, i === cells.length - 1 && hoverCell && lift ? hoverCell : cell)));
}
Object.assign(__ds_scope, { LedgerRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/lists/LedgerRow.jsx", error: String((e && e.message) || e) }); }

// components/lists/RailRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const sides = (c, bottom) => ({
  borderTopColor: c,
  borderRightColor: c,
  borderLeftColor: c,
  borderBottomColor: bottom
});
function RailRow({
  index,
  title,
  subtitle,
  value,
  stacked = false,
  selected = false,
  status,
  color,
  onClick,
  style
}) {
  const [hover, hp] = __ds_scope.useHover();
  const [focus, fp] = __ds_scope.useFocusVisible();
  const isError = status === 'error',
    isDraft = status === 'draft';
  const onFill = Boolean(color) && selected;
  const badge = onFill ? {
    background: 'var(--on-line-soft)',
    color: 'var(--on-line)',
    fontWeight: 600
  } : color ? {
    background: color,
    color: 'var(--on-line)',
    fontWeight: 600
  } : selected ? {
    background: __ds_scope.rgb('accent'),
    color: __ds_scope.rgb('accent-ink'),
    fontWeight: 600
  } : {
    color: __ds_scope.rgb('ink-faint')
  };
  const valueNode = (value != null || status) && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-numeric)',
      whiteSpace: 'nowrap',
      ...(stacked ? {
        marginTop: 2,
        fontSize: 12,
        lineHeight: '16px'
      } : {
        flex: 'none',
        fontSize: 13,
        lineHeight: '20px'
      }),
      color: onFill ? undefined : isError ? __ds_scope.rgb('danger') : isDraft ? __ds_scope.rgb('draft') : selected ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted')
    }
  }, status && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: onFill ? 'currentColor' : isError ? __ds_scope.rgb('danger') : __ds_scope.rgb('draft')
    }
  }), value ?? '—');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    "aria-current": selected || undefined
  }, hp, fp, {
    style: {
      position: 'relative',
      display: 'flex',
      gap: 10,
      width: '100%',
      padding: '12px 10px',
      textAlign: 'left',
      font: 'inherit',
      cursor: 'pointer',
      transition: __ds_scope.T,
      outline: 'none',
      borderWidth: 1,
      borderStyle: 'solid',
      color: onFill ? 'var(--on-line)' : __ds_scope.rgb('ink'),
      background: 'transparent',
      borderRadius: 0,
      boxShadow: 'none',
      ...sides(onFill ? color : selected ? __ds_scope.rgb('accent') : 'transparent', onFill ? color : selected ? __ds_scope.rgb('accent') : __ds_scope.rgb('border')),
      ...(onFill ? {
        background: color,
        borderRadius: 10
      } : selected ? {
        background: __ds_scope.rgb('surface'),
        boxShadow: 'var(--focus-ring)',
        borderRadius: 10
      } : hover ? {
        background: __ds_scope.rgb('surface'),
        borderRadius: 8
      } : null),
      ...(focus ? {
        boxShadow: __ds_scope.RING
      } : null),
      ...style
    }
  }), index != null && /*#__PURE__*/React.createElement("span", {
    style: {
      height: 'fit-content',
      padding: '2px 5px',
      borderRadius: 5,
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      lineHeight: '16px',
      ...badge
    }
  }, String(index).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 600
    }
  }, title), stacked && valueNode, subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2,
      fontSize: 12,
      lineHeight: '16px',
      color: onFill ? undefined : __ds_scope.rgb('ink-muted')
    }
  }, subtitle)), !stacked && valueNode);
}
Object.assign(__ds_scope, { RailRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/lists/RailRow.jsx", error: String((e && e.message) || e) }); }

// components/live/CommitBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Pill({
  amount,
  size,
  block
}) {
  const s = {
    lg: [40, '2px 12px', 10],
    md: [32, '2px 12px', 10],
    sm: [26, '4px 10px', 8]
  }[size];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-numeric)',
      fontWeight: 600,
      letterSpacing: '-0.04em',
      lineHeight: 1.15,
      whiteSpace: 'nowrap',
      background: __ds_scope.rgb('accent'),
      color: __ds_scope.rgb('accent-ink'),
      fontSize: s[0],
      padding: s[1],
      borderRadius: s[2],
      ...(block ? {
        width: '100%',
        textAlign: 'center',
        display: 'block'
      } : {
        alignSelf: 'flex-start'
      })
    }
  }, amount);
}
function Cta({
  label,
  onAction,
  disabled,
  block,
  compact
}) {
  const [hover, hp] = __ds_scope.useHover();
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onAction,
    disabled: disabled
  }, hp, {
    style: {
      borderRadius: 10,
      border: 'none',
      background: __ds_scope.rgb('on-inverse'),
      color: __ds_scope.rgb('inverse'),
      font: '600 14px/20px var(--font-ui)',
      whiteSpace: 'nowrap',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : hover ? 0.9 : 1,
      transition: 'opacity 150ms ' + __ds_scope.EASE,
      ...(block ? {
        width: '100%',
        padding: 12
      } : compact ? {
        height: 38,
        padding: '0 20px'
      } : {
        padding: '12px 20px'
      })
    }
  }), label);
}
function CommitBlock({
  layout = 'stack',
  eyebrow,
  title,
  meta,
  label = 'Total',
  amount,
  actionLabel,
  onAction,
  actionDisabled,
  style
}) {
  const base = {
    background: __ds_scope.rgb('inverse'),
    color: __ds_scope.rgb('on-inverse')
  };
  if (layout === 'row') return /*#__PURE__*/React.createElement("div", {
    style: {
      ...base,
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap',
      padding: '18px 22px',
      borderRadius: 14,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      opacity: 0.6
    }
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 20,
      lineHeight: '28px',
      fontWeight: 700,
      letterSpacing: '-.015em'
    }
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      opacity: 0.6
    }
  }, meta)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      opacity: 0.7
    }
  }, label), /*#__PURE__*/React.createElement(Pill, {
    amount: amount,
    size: "md"
  })), actionLabel && /*#__PURE__*/React.createElement(Cta, {
    label: actionLabel,
    onAction: onAction,
    disabled: actionDisabled
  }));
  if (layout === 'compact') return /*#__PURE__*/React.createElement("div", {
    style: {
      ...base,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '12px 14px 12px 16px',
      borderRadius: 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      opacity: 0.7
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Pill, {
    amount: amount,
    size: "sm"
  })), actionLabel && /*#__PURE__*/React.createElement(Cta, {
    label: actionLabel,
    onAction: onAction,
    disabled: actionDisabled,
    compact: true
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...base,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: 18,
      borderRadius: 14,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      opacity: 0.7
    }
  }, label), /*#__PURE__*/React.createElement(Pill, {
    amount: amount,
    size: "lg",
    block: true
  }), actionLabel && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Cta, {
    label: actionLabel,
    onAction: onAction,
    disabled: actionDisabled,
    block: true
  })));
}
Object.assign(__ds_scope, { CommitBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/live/CommitBlock.jsx", error: String((e && e.message) || e) }); }

// components/live/ResultRow.jsx
try { (() => {
function ResultRow({
  label,
  value,
  unit,
  highlight = false,
  total = false,
  totalColor,
  leader = true,
  detail,
  style
}) {
  if (total) return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      color: __ds_scope.rgb('ink'),
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-numeric)',
      fontWeight: 600,
      letterSpacing: '-.02em',
      ...(totalColor ? {
        background: totalColor,
        borderRadius: 999,
        padding: '4px 14px',
        fontSize: 22,
        color: 'var(--on-line)'
      } : {
        fontSize: 26
      })
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      fontSize: 15,
      lineHeight: '22px',
      color: __ds_scope.rgb('ink'),
      ...(highlight ? {
        padding: '8px 10px',
        margin: '0 -10px',
        borderRadius: 8,
        background: 'var(--accent-soft)'
      } : null),
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, label, detail && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 3,
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      lineHeight: '16px',
      color: __ds_scope.rgb('ink-faint')
    }
  }, detail)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      flex: 1,
      borderBottom: leader && !highlight ? '1px dotted ' + __ds_scope.rgb('border-strong') : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-numeric)',
      whiteSpace: 'nowrap'
    }
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    style: {
      color: __ds_scope.rgb('ink-faint')
    }
  }, " ", unit)));
}
Object.assign(__ds_scope, { ResultRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/live/ResultRow.jsx", error: String((e && e.message) || e) }); }

// components/overlays/ClickTooltip.jsx
try { (() => {
function ClickTooltip({
  content,
  children,
  placement = 'bottom',
  align = 'start',
  open: forced,
  style
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const vis = forced ?? open;
  React.useEffect(() => {
    if (!open) return;
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const pos = {
    ...(placement === 'top' ? {
      bottom: '100%',
      marginBottom: 8
    } : {
      top: '100%',
      marginTop: 8
    }),
    ...(align === 'end' ? {
      right: 0
    } : align === 'center' ? {
      left: '50%',
      transform: 'translateX(-50%)'
    } : {
      left: 0
    })
  };
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    onClick: () => setOpen(o => !o),
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    }
  }, children, vis && /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: 'absolute',
      zIndex: 20,
      width: 288,
      borderRadius: 12,
      border: '1px solid ' + __ds_scope.rgb('border-strong'),
      background: __ds_scope.rgb('surface'),
      padding: '8px 12px',
      fontSize: 12,
      lineHeight: 1.625,
      color: 'var(--ink-body)',
      boxShadow: 'var(--shadow-panel)',
      ...pos
    }
  }, content));
}
Object.assign(__ds_scope, { ClickTooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/ClickTooltip.jsx", error: String((e && e.message) || e) }); }

// components/overlays/ModalDialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const W = {
  small: 384,
  medium: 448,
  large: 512,
  extraLarge: 576,
  wide: 672
};
function ModalDialog({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'medium',
  closeOnBackdropClick = true,
  showCloseButton = true,
  inline = false
}) {
  const [hover, hp] = __ds_scope.useHover();
  React.useEffect(() => {
    if (!isOpen || inline) return;
    const k = e => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [isOpen, inline, onClose]);
  if (!isOpen) return null;
  const panel = /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    "data-surface": "raised",
    style: {
      width: '100%',
      maxWidth: W[maxWidth] || 448,
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      background: __ds_scope.rgb('surface'),
      border: '1px solid ' + __ds_scope.rgb('border-strong'),
      borderRadius: 10,
      boxShadow: 'var(--shadow-panel)',
      color: __ds_scope.rgb('ink')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderBottom: '1px solid ' + __ds_scope.rgb('border'),
      padding: '14px 20px',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 600
    }
  }, title), showCloseButton && /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": "Close",
    onClick: onClose
  }, hp, {
    style: {
      display: 'inline-flex',
      padding: 6,
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      transition: __ds_scope.T,
      background: hover ? 'var(--surface-hover)' : 'transparent',
      color: hover ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted')
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      overflowY: 'auto',
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, children));
  if (inline) return panel;
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => closeOnBackdropClick && e.target === e.currentTarget && onClose && onClose(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      background: 'rgb(var(--overlay) / .5)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }
  }, panel);
}
Object.assign(__ds_scope, { ModalDialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/ModalDialog.jsx", error: String((e && e.message) || e) }); }

// components/overlays/ConfirmDialog.jsx
try { (() => {
function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
  inline
}) {
  if (!isOpen) return null;
  return /*#__PURE__*/React.createElement(__ds_scope.ModalDialog, {
    isOpen: true,
    onClose: onCancel,
    title: title,
    maxWidth: "medium",
    inline: inline
  }, message && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: 'var(--ink-body)',
      whiteSpace: 'pre-line'
    }
  }, message), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    onClick: onCancel
  }, "Cancel"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: destructive ? 'danger' : 'primary',
    onClick: onConfirm
  }, confirmLabel)));
}
Object.assign(__ds_scope, { ConfirmDialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/ConfirmDialog.jsx", error: String((e && e.message) || e) }); }

// components/overlays/NotificationToastCard.jsx
try { (() => {
const V = {
  success: ['check-circle-2', 'committed'],
  error: ['alert-circle', 'danger'],
  warning: ['alert-triangle', 'draft'],
  info: ['info', 'action']
};
function NotificationToastCard({
  message,
  variant = 'success',
  onDismiss,
  showDismissButton = false,
  action,
  style
}) {
  const [icon, tone] = V[variant] || V.success;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 10,
      border: '1px solid ' + __ds_scope.rgb('border-strong'),
      borderLeft: '3px solid ' + __ds_scope.rgb(tone),
      background: __ds_scope.rgb('surface'),
      padding: '12px 14px',
      boxShadow: 'var(--shadow-panel)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16,
    color: __ds_scope.rgb(tone),
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: __ds_scope.rgb('ink'),
      whiteSpace: 'pre-line'
    }
  }, message), action && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: action.onClick,
    style: {
      flex: 'none',
      margin: '-2px 0',
      padding: '2px 6px',
      border: 'none',
      background: 'transparent',
      borderRadius: 4,
      font: '600 14px/20px var(--font-ui)',
      color: __ds_scope.rgb('ink'),
      textDecoration: 'underline',
      textDecorationColor: __ds_scope.rgb('border-strong'),
      cursor: 'pointer'
    }
  }, action.label), showDismissButton && onDismiss && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Dismiss notification",
    onClick: onDismiss,
    style: {
      marginLeft: 4,
      marginRight: -4,
      padding: 2,
      border: 'none',
      background: 'transparent',
      color: __ds_scope.rgb('ink-muted'),
      cursor: 'pointer',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })));
}
Object.assign(__ds_scope, { NotificationToastCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/NotificationToastCard.jsx", error: String((e && e.message) || e) }); }

// components/shell/PageHeader.jsx
try { (() => {
function PageHeader({
  eyebrow,
  title,
  description,
  status,
  editing = false,
  actions,
  style
}) {
  const tone = status && (status.tone === 'error' ? 'danger' : status.tone === 'draft' ? 'draft' : 'committed');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      columnGap: 16,
      rowGap: 12,
      padding: '22px 24px 18px',
      borderBottom: '1px solid ' + __ds_scope.rgb('border'),
      color: __ds_scope.rgb('ink'),
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 'min(100%, 16rem)'
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-numeric)',
      fontSize: 12,
      lineHeight: '16px',
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      color: __ds_scope.rgb('ink-faint')
    }
  }, eyebrow), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: 14,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 30,
      fontWeight: 700,
      letterSpacing: '-.025em',
      lineHeight: 1.15,
      borderBottom: editing ? '1px solid ' + __ds_scope.rgb('border-strong') : 'none',
      flex: editing ? 1 : undefined
    }
  }, title), status && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 13,
      color: __ds_scope.rgb(tone)
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 7,
      height: 7,
      borderRadius: 999,
      background: __ds_scope.rgb(tone)
    }
  }), status.label)), description && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: __ds_scope.rgb('ink-muted')
    }
  }, description)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8
    }
  }, actions));
}
Object.assign(__ds_scope, { PageHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/PageHeader.jsx", error: String((e && e.message) || e) }); }

// components/shell/TopBar.jsx
try { (() => {
function Tab({
  tab,
  on,
  onSelect
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-current": on ? 'page' : undefined,
    onClick: () => onSelect && onSelect(tab.id),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      padding: '7px 12px',
      borderRadius: 7,
      border: 'none',
      font: 'inherit',
      fontSize: 14,
      lineHeight: '20px',
      cursor: 'pointer',
      transition: __ds_scope.T,
      background: on ? __ds_scope.rgb('surface') : 'transparent',
      color: on || h ? __ds_scope.rgb('ink') : __ds_scope.rgb('ink-muted'),
      fontWeight: on ? 600 : 400
    }
  }, tab.label);
}
function TopBar({
  tabs = [],
  active,
  onSelect,
  brand = 'Cost Estimator',
  onBrand,
  right,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 52,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      padding: '0 24px',
      borderBottom: '1px solid ' + __ds_scope.rgb('border'),
      background: __ds_scope.rgb('canvas'),
      color: __ds_scope.rgb('ink'),
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onBrand,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: '-.01em',
      cursor: onBrand ? 'pointer' : undefined,
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 18,
      height: 18,
      borderRadius: 4,
      background: __ds_scope.rgb('accent')
    }
  }), brand), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Main",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, tabs.map(t => t.separator ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    key: t.id,
    name: "chevron-right",
    size: 14,
    color: __ds_scope.rgb('ink-faint'),
    style: {
      margin: '0 6px'
    }
  }) : /*#__PURE__*/React.createElement(Tab, {
    key: t.id,
    tab: t,
    on: t.id === active,
    onSelect: onSelect
  }))), right && /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontSize: 13,
      color: __ds_scope.rgb('ink-muted')
    }
  }, right));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/AppChrome.jsx
try { (() => {
function SettingsMenu({
  dark,
  setDark,
  notify
}) {
  const {
    Segmented,
    Icon
  } = window.WarmMinimalDesignSystem_58386e;
  const [open, setOpen] = React.useState(false);
  const item = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 34,
    padding: '0 10px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    font: '400 13px var(--font-ui)',
    color: 'var(--ink-body)',
    cursor: 'pointer'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setOpen(o => !o),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 32,
      padding: '0 8px',
      border: 'none',
      background: 'transparent',
      borderRadius: 8,
      font: '400 13px var(--font-ui)',
      color: open ? 'rgb(var(--ink))' : 'rgb(var(--ink-muted))',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings"
  }), "Settings"), open && /*#__PURE__*/React.createElement("div", {
    "data-surface": "raised",
    style: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: 8,
      width: 256,
      background: 'rgb(var(--surface))',
      border: '1px solid rgb(var(--border-strong))',
      borderRadius: 10,
      zIndex: 50,
      padding: 8,
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      color: 'rgb(var(--ink-muted))',
      marginBottom: 6
    }
  }, "Appearance"), /*#__PURE__*/React.createElement(Segmented, {
    block: true,
    value: dark ? 'dark' : 'light',
    onChange: v => setDark(v === 'dark'),
    options: [{
      value: 'light',
      label: 'Light'
    }, {
      value: 'dark',
      label: 'Dark'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      paddingTop: 4,
      borderTop: '1px solid rgb(var(--border))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px 6px',
      fontSize: 10.5,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '.14em',
      color: 'rgb(var(--ink-faint))'
    }
  }, "Data"), [['package', 'Export calculator pack…'], ['download', 'Export all data'], ['upload', 'Import data']].map(([ic, l]) => /*#__PURE__*/React.createElement("button", {
    key: l,
    type: "button",
    style: item,
    onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-hover)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    onClick: () => {
      setOpen(false);
      notify({
        message: l.replace('…', '') + ' — not part of this kit.',
        variant: 'info'
      });
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic
  }), l)))));
}
function AddCalculatorDialog({
  open,
  onClose,
  onPick
}) {
  const {
    ModalDialog,
    SearchInput,
    RailRow
  } = window.WarmMinimalDesignSystem_58386e;
  const [q, setQ] = React.useState('');
  const list = window.CE.calculators.filter(c => c.compute && c.name.toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement(ModalDialog, {
    isOpen: open,
    onClose: onClose,
    title: "Add calculator",
    maxWidth: "large"
  }, /*#__PURE__*/React.createElement(SearchInput, {
    value: q,
    onChange: setQ,
    placeholder: "Search calculators\u2026"
  }), /*#__PURE__*/React.createElement("div", null, list.map(c => /*#__PURE__*/React.createElement(RailRow, {
    key: c.id,
    title: c.name,
    subtitle: c.category + ' · ' + c.description,
    color: undefined,
    onClick: () => onPick(c)
  }))));
}
Object.assign(window, {
  SettingsMenu,
  AddCalculatorDialog
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/AppChrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/CalculatorsScreen.jsx
try { (() => {
function CalcRow({
  c,
  on,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      gap: 12,
      padding: '14px 12px 14px 4px',
      cursor: 'pointer',
      borderWidth: 1,
      borderStyle: 'solid',
      borderTopColor: on ? 'rgb(var(--accent))' : 'transparent',
      borderRightColor: on ? 'rgb(var(--accent))' : 'transparent',
      borderLeftColor: on ? 'rgb(var(--accent))' : 'transparent',
      borderBottomColor: on ? 'rgb(var(--accent))' : 'rgb(var(--border))',
      ...(on ? {
        background: 'rgb(var(--surface))',
        boxShadow: 'var(--focus-ring)',
        borderRadius: 10
      } : h ? {
        background: 'rgb(var(--surface))',
        borderRadius: 8
      } : null)
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 2,
      opacity: h ? 1 : 0
    }
  }, /*#__PURE__*/React.createElement(window.WarmMinimalDesignSystem_58386e.Icon, {
    name: "grip-vertical",
    color: "rgb(var(--ink-faint))"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 15,
      fontWeight: 600
    }
  }, c.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 3,
      fontSize: 13,
      color: 'rgb(var(--ink-muted))'
    }
  }, c.description)), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      fontSize: 12,
      color: 'rgb(var(--ink-faint))',
      whiteSpace: 'nowrap'
    }
  }, c.inputs.length || 4, " in", c.parts > 1 ? ' · ' + c.parts + ' parts' : ''));
}
function QuickView({
  calc,
  onClose,
  onSend
}) {
  const {
    IconButton,
    CommitBlock,
    ResultRow
  } = window.WarmMinimalDesignSystem_58386e;
  const [values, setValues] = React.useState({});
  const r = calc.compute ? calc.compute(values) : {
    missing: ['inputs']
  };
  const started = Object.values(values).some(v => v !== undefined);
  return /*#__PURE__*/React.createElement("div", {
    "data-surface": "raised",
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: '18px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '-.02em'
    }
  }, calc.name), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 13,
      color: 'rgb(var(--ink-muted))'
    }
  }, calc.description)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "Open to use",
    icon: "arrow-up-right"
  }), /*#__PURE__*/React.createElement(IconButton, {
    label: "Reset values",
    icon: "rotate-ccw",
    disabled: !started,
    onClick: () => setValues({})
  }), /*#__PURE__*/React.createElement(IconButton, {
    label: "Edit",
    icon: "pencil"
  }), /*#__PURE__*/React.createElement(IconButton, {
    label: "Close preview",
    icon: "x",
    onClick: onClose
  }))), calc.compute ? /*#__PURE__*/React.createElement(LineForm, {
    calc: calc,
    values: values,
    size: "compact",
    needed: started ? r.missing || [] : [],
    onChange: (k, v) => setValues(s => ({
      ...s,
      [k]: v
    }))
  }) : /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'rgb(var(--ink-muted))'
    }
  }, "Sample calculator \u2014 inputs not filled in for this kit."), r.results && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, r.results.map(([l, v, u]) => /*#__PURE__*/React.createElement(ResultRow, {
    key: l,
    label: l,
    value: v,
    unit: u
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 22px 18px',
      borderTop: '1px solid rgb(var(--border))'
    }
  }, /*#__PURE__*/React.createElement(CommitBlock, {
    layout: "compact",
    label: r.missing ? 'Fill in ' + r.missing.join(', ') : 'Total',
    amount: r.missing ? '—' : window.CE.kr(r.cost),
    actionLabel: "Send to quote",
    actionDisabled: !!r.missing,
    onAction: () => onSend(calc, values)
  })));
}
function CalculatorsScreen({
  onSend
}) {
  const {
    PageHeader,
    SearchInput,
    Button,
    Icon,
    CategoryRail
  } = window.WarmMinimalDesignSystem_58386e;
  const all = window.CE.calculators;
  const [cat, setCat] = React.useState('');
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState('c1');
  const cats = [...new Set(all.map(c => c.category))];
  const listed = all.filter(c => (!cat || c.category === cat) && c.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = listed.find(c => c.id === sel);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'calc(100vh - 52px)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: all.length + ' calculators · Last pack exported Oct 1',
    title: "Calculators",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SearchInput, {
      value: q,
      onChange: setQ,
      placeholder: "Search calculators\u2026",
      style: {
        width: 240
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      title: "New calculator",
      "aria-label": "New calculator",
      style: {
        width: 36,
        padding: 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus"
    })))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: '200px minmax(0,1fr) 420px'
    }
  }, /*#__PURE__*/React.createElement(CategoryRail, {
    value: cat,
    onChange: setCat,
    options: [{
      value: '',
      label: 'All',
      count: all.length
    }, ...cats.map(c => ({
      value: c,
      label: c,
      count: all.filter(x => x.category === c).length
    }))]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      padding: '16px 12px 96px',
      overflowY: 'auto'
    }
  }, listed.map(c => /*#__PURE__*/React.createElement(CalcRow, {
    key: c.id,
    c: c,
    on: c.id === sel,
    onClick: () => setSel(c.id)
  })), listed.length === 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      padding: '32px 0',
      textAlign: 'center',
      fontSize: 14,
      color: 'rgb(var(--ink-muted))'
    }
  }, "No calculators match \u201C", q.trim(), "\u201D.")), /*#__PURE__*/React.createElement("aside", {
    style: {
      minHeight: 0,
      background: 'rgb(var(--panel))',
      borderLeft: '1px solid rgb(var(--border))',
      overflow: 'hidden'
    }
  }, chosen ? /*#__PURE__*/React.createElement(QuickView, {
    key: chosen.id,
    calc: chosen,
    onClose: () => setSel(null),
    onSend: onSend
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 32px',
      textAlign: 'center',
      fontSize: 14,
      color: 'rgb(var(--ink-muted))'
    }
  }, "Choose a calculator to try it out."))));
}
window.CalculatorsScreen = CalculatorsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/CalculatorsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/LineForm.jsx
try { (() => {
// A calculator's inputs as staff fill them in: six-column grid, filled 42px wells (CalculatorInputField).
function LineForm({
  calc,
  values,
  onChange,
  size = 'md',
  needed = []
}) {
  const {
    Input,
    Select,
    Toggle
  } = window.WarmMinimalDesignSystem_58386e;
  const H = size === 'compact' ? 38 : size === 'large' ? 46 : 42;
  const label = inp => /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 12,
      lineHeight: '16px',
      color: 'rgb(var(--ink-muted))',
      marginBottom: 6
    }
  }, inp.label, inp.unit && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4,
      fontFamily: 'var(--font-numeric)',
      color: 'rgb(var(--ink-faint))'
    }
  }, inp.unit));
  const span = s => size === 'compact' ? 'span 3' : 'span ' + s;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6,minmax(0,1fr))',
      columnGap: 18,
      rowGap: 16
    }
  }, calc.inputs.map(inp => {
    const v = values[inp.key] ?? inp.default;
    const isNeeded = needed.includes(inp.label);
    let control;
    if (inp.kind === 'number') control = /*#__PURE__*/React.createElement(Input, {
      type: "number",
      size: size,
      value: v ?? '',
      onChange: e => onChange(inp.key, e.target.value === '' ? undefined : e.target.value.replace(',', '.'))
    });else if (inp.kind === 'choice') control = /*#__PURE__*/React.createElement(Select, {
      size: size,
      value: v,
      onChange: e => onChange(inp.key, e.target.value),
      options: inp.options.map(o => ({
        value: o,
        label: o + (inp.unit ? ' ' + inp.unit : '')
      }))
    });else if (inp.kind === 'material') control = /*#__PURE__*/React.createElement(Select, {
      size: size,
      value: v ?? '',
      onChange: e => onChange(inp.key, e.target.value || undefined),
      options: [...(v ? [] : [{
        value: '',
        label: 'Choose a material…'
      }]), ...window.CE.pick(inp.category).map(m => ({
        value: m.variable,
        label: m.name + ' · ' + window.CE.kr(m.price) + '/' + m.unit
      }))]
    });else control = /*#__PURE__*/React.createElement(Toggle, {
      checked: !!v,
      onChange: c => onChange(inp.key, c),
      label: v ? 'Yes' : 'No',
      style: {
        height: H,
        paddingTop: 0,
        paddingBottom: 0
      }
    });
    return /*#__PURE__*/React.createElement("div", {
      key: inp.key,
      style: {
        gridColumn: span(inp.span)
      }
    }, label(inp), control, isNeeded && /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '4px 0 0',
        fontSize: 12,
        fontWeight: 500,
        color: 'rgb(var(--draft))'
      }
    }, "Needed to calculate"));
  }));
}
window.LineForm = LineForm;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/LineForm.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/MaterialsScreen.jsx
try { (() => {
function MatRow({
  m,
  on,
  onClick
}) {
  const [h, setH] = React.useState(false);
  const {
    Icon
  } = window.WarmMinimalDesignSystem_58386e;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    role: "row",
    style: {
      display: 'grid',
      gridTemplateColumns: '20px minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.1fr) 7.5rem 4rem',
      alignItems: 'center',
      gap: 14,
      padding: 12,
      cursor: 'pointer',
      borderWidth: 1,
      borderStyle: 'solid',
      borderTopColor: on ? 'rgb(var(--accent))' : 'transparent',
      borderRightColor: on ? 'rgb(var(--accent))' : 'transparent',
      borderLeftColor: on ? 'rgb(var(--accent))' : 'transparent',
      borderBottomColor: on ? 'rgb(var(--accent))' : 'rgb(var(--border))',
      ...(on ? {
        background: 'rgb(var(--surface))',
        boxShadow: 'var(--focus-ring)',
        borderRadius: 10
      } : h ? {
        background: 'rgb(var(--surface))',
        borderRadius: 8
      } : null)
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: h ? 1 : 0,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "grip-vertical",
    color: "rgb(var(--ink-faint))"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 600
    }
  }, m.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2,
      fontSize: 12,
      color: 'rgb(var(--ink-muted))'
    }
  }, m.category, " \xB7 ", m.sku ? 'SKU ' + m.sku : m.supplier)), /*#__PURE__*/React.createElement("code", {
    className: "font-numeric",
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'rgb(var(--token-input))'
    }
  }, m.variable), m.props.length ? /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      fontSize: 12,
      lineHeight: 1.625,
      color: 'rgb(var(--ink-muted))'
    }
  }, m.props.slice(0, 3).map(p => /*#__PURE__*/React.createElement("span", {
    key: p,
    style: {
      display: 'block'
    }
  }, p)), m.props.length > 3 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      color: 'rgb(var(--ink-faint))'
    }
  }, "+", m.props.length - 3, " more")) : /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: 'rgb(var(--draft))'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9,
      background: 'rgb(var(--draft))'
    }
  }), "no properties"), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      textAlign: 'right',
      fontSize: 14,
      fontWeight: 500
    }
  }, window.CE.kr(m.price)), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      textAlign: 'right',
      fontSize: 12,
      color: 'var(--ink-body)'
    }
  }, m.unit));
}
function MaterialsScreen() {
  const {
    PageHeader,
    SearchInput,
    Button,
    Icon,
    CategoryRail
  } = window.WarmMinimalDesignSystem_58386e;
  const all = window.CE.materials;
  const [cat, setCat] = React.useState('');
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(null);
  const cats = [...new Set(all.map(m => m.category))];
  const listed = all.filter(m => (!cat || m.category === cat) && (m.name + m.variable + (m.sku || '')).toLowerCase().includes(q.toLowerCase()));
  const head = {
    fontFamily: 'var(--font-numeric)',
    fontSize: 12,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'rgb(var(--ink-faint))'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'calc(100vh - 52px)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: all.length + ' materials · prices used by every calculator',
    title: "Materials",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SearchInput, {
      value: q,
      onChange: setQ,
      placeholder: "Search name, SKU, variable\u2026",
      style: {
        width: 240
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      title: "New material",
      "aria-label": "New material",
      style: {
        width: 36,
        padding: 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus"
    })))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: '200px minmax(0,1fr) 420px'
    }
  }, /*#__PURE__*/React.createElement(CategoryRail, {
    value: cat,
    onChange: setCat,
    options: [{
      value: '',
      label: 'All',
      count: all.length
    }, ...cats.map(c => ({
      value: c,
      label: c,
      count: all.filter(x => x.category === c).length
    }))]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      padding: '16px 12px 96px',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '20px minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.1fr) 7.5rem 4rem',
      gap: 14,
      padding: '0 12px 10px',
      borderBottom: '1px solid rgb(var(--border))',
      ...head
    }
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null, "Name"), /*#__PURE__*/React.createElement("span", null, "Variable"), /*#__PURE__*/React.createElement("span", null, "Properties"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Price"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Unit")), listed.map(m => /*#__PURE__*/React.createElement(MatRow, {
    key: m.id,
    m: m,
    on: m.id === sel,
    onClick: () => setSel(m.id)
  }))), /*#__PURE__*/React.createElement("aside", {
    style: {
      background: 'rgb(var(--panel))',
      borderLeft: '1px solid rgb(var(--border))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 32px',
      textAlign: 'center',
      fontSize: 14,
      color: 'rgb(var(--ink-muted))'
    }
  }, sel ? 'Material editor panel — not recreated in this kit (see MaterialEditorPanel.tsx).' : 'Choose a material to edit it.')));
}
window.MaterialsScreen = MaterialsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/MaterialsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/QuoteBoardScreen.jsx
try { (() => {
function QuoteBoardScreen({
  quote,
  others,
  onOpen,
  onNew
}) {
  const {
    PageHeader,
    SearchInput,
    Button,
    Icon,
    CommitBlock,
    LedgerTable,
    LedgerRow
  } = window.WarmMinimalDesignSystem_58386e;
  const kr = window.CE.kr;
  const [q, setQ] = React.useState('');
  const states = quote.lines.map(window.lineState);
  const sub = states.reduce((a, s) => a + s.cost, 0),
    total = sub * (1 + quote.markup / 100) * (1 + quote.vat / 100);
  const searching = q.trim() !== '';
  const all = [{
    ...quote,
    total,
    lineCount: quote.lines.length
  }, ...others];
  const listed = searching ? all.filter(x => x.name.toLowerCase().includes(q.toLowerCase())) : others;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: all.length + ' quotes',
    title: "Quotes",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SearchInput, {
      value: q,
      onChange: setQ,
      placeholder: "Search quotes\u2026",
      style: {
        width: 220
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      onClick: onNew,
      title: "New quote",
      "aria-label": "New quote",
      style: {
        width: 36,
        padding: 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus"
    })))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22,
      padding: '22px 24px'
    }
  }, !searching && /*#__PURE__*/React.createElement(CommitBlock, {
    layout: "row",
    eyebrow: "Pick up where you left off",
    title: quote.name,
    meta: quote.lines.length + ' lines · ' + states.slice(0, 3).map(s => s.title).join(', ') + (states.length > 3 ? ', …' : '') + ' · edited ' + quote.updated,
    label: "Total",
    amount: kr(total),
    actionLabel: "Continue",
    onAction: () => onOpen(quote.id)
  }), listed.length > 0 && /*#__PURE__*/React.createElement(LedgerTable, {
    columns: [{
      label: 'Quote'
    }, {
      label: 'Lines',
      align: 'right',
      width: '90px'
    }, {
      label: 'Edited',
      width: '160px'
    }, {
      label: 'Total',
      align: 'right',
      width: 'minmax(7rem,160px)'
    }, {
      label: '',
      align: 'right',
      width: '56px'
    }]
  }, listed.map(x => /*#__PURE__*/React.createElement(LedgerRow, {
    key: x.id,
    onClick: () => x.id === quote.id && onOpen(x.id),
    cells: [/*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, x.name), /*#__PURE__*/React.createElement("span", {
      className: "font-numeric",
      style: {
        fontSize: 13,
        color: 'rgb(var(--ink-muted))'
      }
    }, x.lineCount), /*#__PURE__*/React.createElement("span", {
      className: "font-numeric",
      style: {
        fontSize: 13,
        color: 'rgb(var(--ink-muted))'
      }
    }, x.updated), /*#__PURE__*/React.createElement("span", {
      className: "font-numeric",
      style: {
        color: x.lineCount ? undefined : 'rgb(var(--ink-faint))'
      }
    }, x.lineCount ? kr(x.total) : '—'), /*#__PURE__*/React.createElement(Icon, {
      name: "more-horizontal",
      color: "rgb(var(--ink-faint))"
    })],
    hoverCell: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: 'rgb(var(--danger))'
      }
    }, "Delete")
  }))), searching && listed.length === 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      padding: '32px 0',
      textAlign: 'center',
      fontSize: 14,
      color: 'rgb(var(--ink-muted))'
    }
  }, "No quotes match \u201C", q.trim(), "\u201D.")));
}
window.QuoteBoardScreen = QuoteBoardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/QuoteBoardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/QuoteWorkspace.jsx
try { (() => {
function lineState(line) {
  const calc = window.CE.calculators.find(c => c.id === line.calc);
  const r = calc.compute(line.values);
  return {
    calc,
    r,
    title: line.nickname || calc.name,
    color: 'var(--line-' + calc.color + ')',
    unfinished: r.missing ? 'Fill in ' + r.missing.join(', ') : null,
    cost: r.cost || 0
  };
}
function RateRow({
  label,
  value,
  onChange,
  amount
}) {
  const [f, setF] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      height: 28,
      width: 72,
      padding: '0 6px 0 8px',
      borderRadius: 6,
      background: f ? 'rgb(var(--field-hover))' : 'rgb(var(--field))',
      boxShadow: f ? 'var(--field-focus)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => onChange(e.target.value),
    onFocus: () => setF(true),
    onBlur: () => setF(false),
    inputMode: "decimal",
    style: {
      width: '100%',
      minWidth: 0,
      border: 'none',
      background: 'transparent',
      font: '400 13px var(--font-numeric)',
      color: 'rgb(var(--ink))',
      outline: 'none',
      caretColor: 'rgb(var(--accent))'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      fontSize: 13
    }
  }, "%")), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      width: 96,
      textAlign: 'right',
      color: 'rgb(var(--ink))'
    }
  }, amount));
}
function QuoteWorkspace({
  quote,
  setQuote,
  onClose,
  onAdd,
  notify,
  focusLine
}) {
  const {
    PageHeader,
    Breadcrumb,
    Button,
    IconButton,
    HeaderDivider,
    Eyebrow,
    RailRow,
    DashedAdd,
    ResultRow,
    CommitBlock,
    ConfirmDialog
  } = window.WarmMinimalDesignSystem_58386e;
  const kr = window.CE.kr;
  const [chosen, setChosen] = React.useState(quote.lines[0]?.id);
  const [confirm, setConfirm] = React.useState(null);
  React.useEffect(() => {
    if (focusLine) setChosen(focusLine);
  }, [focusLine]);
  const states = quote.lines.map(l => ({
    line: l,
    ...lineState(l)
  }));
  const sel = states.find(s => s.line.id === chosen) || states[0];
  const idx = sel ? states.indexOf(sel) : -1;
  const unfinished = states.filter(s => s.unfinished);
  const subtotal = states.reduce((a, s) => a + s.cost, 0),
    markup = subtotal * (+quote.markup || 0) / 100,
    vat = (subtotal + markup) * (+quote.vat || 0) / 100;
  const update = lines => setQuote({
    ...quote,
    lines
  });
  const setLine = (id, patch) => update(quote.lines.map(l => l.id === id ? {
    ...l,
    ...patch
  } : l));
  const duplicate = () => {
    const base = sel.line.nickname || sel.calc.name;
    const n = quote.lines.filter(l => (l.nickname || '').startsWith(base.replace(/ \d+$/, ''))).length + 1;
    const copy = {
      ...sel.line,
      id: 'l' + Date.now(),
      nickname: base.replace(/ \d+$/, '') + ' ' + n,
      values: {
        ...sel.line.values
      }
    };
    const lines = [...quote.lines];
    lines.splice(idx + 1, 0, copy);
    update(lines);
    setChosen(copy.id);
  };
  const move = d => {
    const lines = [...quote.lines];
    const [x] = lines.splice(idx, 1);
    lines.splice(idx + d, 0, x);
    update(lines);
  };
  const remove = () => {
    const removed = sel.line,
      at = idx,
      lines = quote.lines.filter(l => l.id !== removed.id);
    update(lines);
    setChosen(lines[Math.min(at, lines.length - 1)]?.id);
    notify({
      message: 'Removed “' + sel.title + '”.',
      action: {
        label: 'Undo',
        onClick: () => {
          setQuote(q => {
            const ls = [...q.lines];
            ls.splice(at, 0, removed);
            return {
              ...q,
              lines: ls
            };
          });
          setChosen(removed.id);
        }
      }
    });
  };
  const meta = [quote.lines.length + (quote.lines.length === 1 ? ' line' : ' lines'), unfinished.length ? unfinished.length + ' not finished' : null, 'Saved automatically · edited ' + quote.updated].filter(Boolean).join(' · ');
  const exportQuote = () => unfinished.length ? setConfirm('export') : notify({
    message: 'Quote sent to print.',
    variant: 'success'
  });
  const onLine = {
    color: 'var(--on-line)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'calc(100vh - 52px)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    editing: true,
    eyebrow: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: 'Quotes'
      }],
      meta: meta,
      onNavigate: onClose
    }),
    title: /*#__PURE__*/React.createElement("input", {
      value: quote.name,
      onChange: e => setQuote({
        ...quote,
        name: e.target.value
      }),
      "aria-label": "Quote name",
      placeholder: "Untitled quote",
      style: {
        width: '100%',
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        letterSpacing: 'inherit',
        color: 'inherit',
        outline: 'none',
        padding: 0
      }
    }),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      onClick: onAdd
    }, "+ Add calculator"), /*#__PURE__*/React.createElement(HeaderDivider, null), /*#__PURE__*/React.createElement(IconButton, {
      label: "Export JSON",
      size: "lg",
      icon: "download",
      onClick: () => notify({
        message: 'Downloaded messe-oslo-stand.json',
        variant: 'success'
      })
    }), /*#__PURE__*/React.createElement(IconButton, {
      label: "Delete quote",
      size: "lg",
      variant: "danger",
      icon: "trash-2",
      onClick: () => setConfirm('delete')
    }), /*#__PURE__*/React.createElement(IconButton, {
      label: "Close",
      size: "lg",
      icon: "x",
      onClick: onClose
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: '260px minmax(0,1fr) 360px'
    }
  }, /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Lines",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '16px 12px',
      borderRight: '1px solid rgb(var(--border))',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 10px 8px'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Lines"), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      fontSize: 12,
      color: 'rgb(var(--ink-faint))'
    }
  }, quote.lines.length)), states.map((s, i) => /*#__PURE__*/React.createElement(RailRow, {
    key: s.line.id,
    index: i + 1,
    title: s.title,
    subtitle: s.unfinished || s.r.summary,
    value: s.unfinished ? 'Not finished' : kr(s.cost),
    status: s.unfinished ? 'draft' : undefined,
    selected: s === sel,
    stacked: true,
    color: s.color,
    onClick: () => setChosen(s.line.id)
  })), /*#__PURE__*/React.createElement(DashedAdd, {
    onClick: onAdd,
    style: {
      marginTop: 8
    }
  }, "+ Add from calculator"), quote.lines.length > 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 'auto 0 0',
      padding: '16px 10px 0',
      fontSize: 12,
      lineHeight: 1.5,
      color: 'rgb(var(--ink-faint))'
    }
  }, "Duplicate a line for each wall, room or part. ", /*#__PURE__*/React.createElement("kbd", {
    className: "font-numeric"
  }, "\u2318D"))), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      padding: '24px 32px',
      overflowY: 'auto'
    }
  }, sel ? /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 12,
      background: sel.color,
      margin: '-24px -32px 0',
      padding: '22px 32px 18px',
      ...onLine
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: sel.line.nickname,
    placeholder: sel.calc.name,
    onChange: e => setLine(sel.line.id, {
      nickname: e.target.value
    }),
    "aria-label": "Name on the quote",
    style: {
      flex: 1,
      minWidth: '12rem',
      padding: '0 0 6px',
      background: 'transparent',
      border: 'none',
      borderBottom: '1px solid var(--on-line-rule)',
      font: '700 22px/1.25 var(--font-ui)',
      letterSpacing: '-.02em',
      color: 'var(--on-line)',
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px',
      borderRadius: 999,
      fontSize: 12,
      background: 'var(--on-line-soft)'
    }
  }, sel.calc.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, [['Duplicate', 'copy', duplicate], ['Move up', 'arrow-up', () => move(-1), idx === 0], ['Move down', 'arrow-down', () => move(1), idx === states.length - 1], ['Remove', 'trash-2', remove]].map(([l, ic, fn, dis]) => /*#__PURE__*/React.createElement(IconButton, {
    key: l,
    label: l,
    icon: ic,
    onClick: fn,
    disabled: dis,
    style: {
      color: 'var(--on-line)',
      background: 'transparent',
      borderRadius: 12
    }
  })))), /*#__PURE__*/React.createElement(LineForm, {
    calc: sel.calc,
    values: sel.line.values,
    needed: sel.r.missing || [],
    onChange: (k, v) => setLine(sel.line.id, {
      values: {
        ...sel.line.values,
        [k]: v
      }
    })
  }), sel.r.results && /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginBottom: 12
    }
  }, "Results"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, sel.r.results.map(([l, v, u, d]) => /*#__PURE__*/React.createElement(ResultRow, {
    key: l,
    label: l,
    value: v,
    unit: u,
    detail: d
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgb(var(--border))',
      paddingTop: 18
    }
  }, sel.unfinished ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, "Line total"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'rgb(var(--draft))'
    }
  }, "Not finished \xB7 ", sel.unfinished)) : /*#__PURE__*/React.createElement(ResultRow, {
    label: "Line total",
    value: kr(sel.cost),
    total: true,
    totalColor: sel.color
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 10,
      border: '1px dashed rgb(var(--border-strong))',
      padding: '40px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: 'rgb(var(--ink-muted))'
    }
  }, "No lines yet. Add a calculator, fill it in, and duplicate it for each wall, room or part."), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    style: {
      marginTop: 12
    },
    onClick: onAdd
  }, "+ Add calculator"))), /*#__PURE__*/React.createElement("div", {
    "data-surface": "raised",
    style: {
      padding: '20px 24px',
      background: 'rgb(var(--panel))',
      borderLeft: '1px solid rgb(var(--border))',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    as: "h2"
  }, "In the quote"), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: '16px 0 0',
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      fontSize: 14
    }
  }, states.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.line.id,
    onClick: () => setChosen(s.line.id),
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 8,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 5,
      width: 8,
      height: 8,
      flex: 'none',
      borderRadius: 999,
      background: s.color
    }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontWeight: 600
    }
  }, s.title), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      display: 'block',
      marginTop: 3,
      fontSize: 12,
      color: s.unfinished ? 'rgb(var(--draft))' : 'rgb(var(--ink-faint))'
    }
  }, s.unfinished || s.r.summary))), s.unfinished ? /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      fontSize: 12,
      color: 'rgb(var(--draft))'
    }
  }, "Not finished") : /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      flex: 'none'
    }
  }, kr(s.cost))))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '18px 0',
      borderTop: '1px dashed rgb(var(--border-strong))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      fontSize: 14,
      color: 'rgb(var(--ink-muted))',
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Subtotal"), /*#__PURE__*/React.createElement("span", {
    className: "font-numeric",
    style: {
      color: 'rgb(var(--ink))'
    }
  }, kr(subtotal))), /*#__PURE__*/React.createElement(RateRow, {
    label: "Markup",
    value: quote.markup,
    onChange: v => setQuote({
      ...quote,
      markup: v
    }),
    amount: kr(markup)
  }), /*#__PURE__*/React.createElement(RateRow, {
    label: "VAT",
    value: quote.vat,
    onChange: v => setQuote({
      ...quote,
      vat: v
    }),
    amount: kr(vat)
  }), unfinished.length > 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: 'rgb(var(--draft))'
    }
  }, unfinished.length === 1 ? '1 line is' : unfinished.length + ' lines are', " not finished and not counted.")), /*#__PURE__*/React.createElement(CommitBlock, {
    style: {
      marginTop: 'auto'
    },
    label: "Total incl. VAT",
    amount: kr(subtotal + markup + vat),
    actionLabel: "Export quote",
    onAction: exportQuote
  }))), /*#__PURE__*/React.createElement(ConfirmDialog, {
    isOpen: confirm === 'export',
    title: unfinished.length === 1 ? '1 line isn’t finished' : unfinished.length + ' lines aren’t finished',
    message: unfinished.map(s => s.title + ': ' + s.unfinished).join('\n') + '\n\nThey aren’t included in the total. Export anyway?',
    confirmLabel: "Export anyway",
    onConfirm: () => {
      setConfirm(null);
      notify({
        message: 'Quote sent to print.'
      });
    },
    onCancel: () => setConfirm(null)
  }), /*#__PURE__*/React.createElement(ConfirmDialog, {
    isOpen: confirm === 'delete',
    title: "Delete quote?",
    message: '“' + (quote.name || 'Untitled quote') + '” will be permanently deleted.',
    confirmLabel: "Delete",
    destructive: true,
    onConfirm: () => {
      setConfirm(null);
      onClose();
    },
    onCancel: () => setConfirm(null)
  }));
}
window.QuoteWorkspace = QuoteWorkspace;
window.lineState = lineState;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/QuoteWorkspace.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cost-estimator/data.js
try { (() => {
(() => {
  const kr = n => n.toLocaleString('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).replace(/\u00a0/g, ' ') + ' kr';
  const materials = [{
    id: 'm1',
    name: 'Stud 48×98',
    variable: 'stud_48x98',
    category: 'Lumber',
    sku: '10422',
    price: 32.5,
    unit: 'm',
    props: ['width 48 mm', 'depth 98 mm']
  }, {
    id: 'm2',
    name: 'Stud 36×73',
    variable: 'stud_36x73',
    category: 'Lumber',
    sku: '10418',
    price: 21.9,
    unit: 'm',
    props: ['width 36 mm', 'depth 73 mm']
  }, {
    id: 'm3',
    name: 'Gypsum board 13 mm',
    variable: 'gips_13',
    category: 'Sheets',
    sku: '20110',
    price: 129,
    unit: 'sheet',
    props: ['width 1.2 m', 'height 2.4 m', 'price_per_sheet 129']
  }, {
    id: 'm4',
    name: 'Plywood 12 mm',
    variable: 'ply_12',
    category: 'Sheets',
    sku: '20214',
    price: 389,
    unit: 'sheet',
    props: ['width 1.22 m', 'height 2.44 m']
  }, {
    id: 'm5',
    name: 'Wall paint, white',
    variable: 'paint_white',
    category: 'Paint',
    supplier: 'Jotun',
    price: 1149,
    unit: 'bucket',
    props: ['coverage 10 m²/l', 'volume 10 l']
  }, {
    id: 'm6',
    name: 'Primer',
    variable: 'primer',
    category: 'Paint',
    supplier: 'Jotun',
    price: 690,
    unit: 'bucket',
    props: []
  }, {
    id: 'm7',
    name: 'Needle-felt carpet',
    variable: 'carpet_felt',
    category: 'Flooring',
    sku: '40031',
    price: 89,
    unit: 'm²',
    props: ['roll width 4 m']
  }, {
    id: 'm8',
    name: 'Raised floor panel',
    variable: 'floor_panel',
    category: 'Flooring',
    sku: '40102',
    price: 420,
    unit: 'm²',
    props: ['height 10 cm']
  }];
  const byVar = Object.fromEntries(materials.map(m => [m.variable, m]));
  const pick = cat => materials.filter(m => m.category === cat);
  const wall = {
    id: 'c1',
    name: 'Partition wall',
    category: 'Walls',
    color: 'teal',
    description: 'Studs, sheets and paint for one wall.',
    inputs: [{
      key: 'width',
      label: 'Width',
      unit: 'm',
      kind: 'number',
      span: 2
    }, {
      key: 'height',
      label: 'Height',
      unit: 'm',
      kind: 'number',
      span: 2
    }, {
      key: 'stud_spacing',
      label: 'Stud spacing',
      unit: 'cm',
      kind: 'choice',
      options: ['40', '60'],
      default: '60',
      span: 2
    }, {
      key: 'lumber',
      label: 'Lumber',
      kind: 'material',
      category: 'Lumber',
      span: 3
    }, {
      key: 'spill',
      label: 'Spill',
      unit: '%',
      kind: 'choice',
      options: ['0', '10', '15'],
      default: '10',
      span: 3
    }, {
      key: 'sheets',
      label: 'Sheets',
      kind: 'material',
      category: 'Sheets',
      span: 3
    }, {
      key: 'both_sheet',
      label: 'Sheeting on both sides',
      kind: 'boolean',
      span: 3
    }, {
      key: 'paint',
      label: 'Paint',
      kind: 'material',
      category: 'Paint',
      span: 3
    }, {
      key: 'layers',
      label: 'Paint layers',
      kind: 'number',
      default: 2,
      span: 3
    }, {
      key: 'both_paint',
      label: 'Painted on both sides',
      kind: 'boolean',
      span: 3
    }, {
      key: 'quantity',
      label: 'Quantity',
      unit: 'pcs',
      kind: 'number',
      default: 1,
      span: 3
    }],
    compute(v) {
      const need = ['width', 'height', 'lumber', 'sheets', 'paint'].filter(k => v[k] == null || v[k] === '');
      if (need.length) return {
        missing: need.map(k => this.inputs.find(i => i.key === k).label)
      };
      const w = +v.width,
        h = +v.height,
        sp = +(v.stud_spacing || 60) / 100,
        spill = +(v.spill ?? 10),
        layers = +(v.layers ?? 2),
        q = +(v.quantity ?? 1);
      const studs = Math.ceil(w / sp) + 1,
        framing = 2 * (w + h) + h * studs,
        sheets = Math.ceil(h / 2.4) * Math.ceil(w / 1.2) * (v.both_sheet ? 2 : 1);
      const area = w * h,
        vol = area * layers * (v.both_paint ? 2 : 1) / 10;
      const cost = (framing * (1 + spill / 100) * byVar[v.lumber].price + sheets * byVar[v.sheets].price + Math.ceil(vol / 10) * byVar[v.paint].price) * q;
      return {
        cost,
        summary: `${w} × ${h} m`,
        results: [['Paint area', area.toFixed(1).replace('.0', ''), 'm²'], ['Framing', framing.toFixed(1), 'm', `perimeter + ${studs} studs × ${h} m`], ['Sheet count', String(sheets), 'pcs'], ['Paint volume', vol.toFixed(1), 'l']]
      };
    }
  };
  const floor = {
    id: 'c2',
    name: 'Stand floor',
    category: 'Floors',
    color: 'amber',
    description: 'Carpet on an optional raised floor.',
    inputs: [{
      key: 'width',
      label: 'Width',
      unit: 'm',
      kind: 'number',
      span: 3
    }, {
      key: 'depth',
      label: 'Depth',
      unit: 'm',
      kind: 'number',
      span: 3
    }, {
      key: 'carpet',
      label: 'Carpet',
      kind: 'material',
      category: 'Flooring',
      span: 3
    }, {
      key: 'raised',
      label: 'Raised floor',
      kind: 'boolean',
      span: 3
    }],
    compute(v) {
      const need = ['width', 'depth', 'carpet'].filter(k => v[k] == null || v[k] === '');
      if (need.length) return {
        missing: need.map(k => this.inputs.find(i => i.key === k).label)
      };
      const a = +v.width * +v.depth;
      return {
        cost: a * byVar[v.carpet].price * 1.05 + (v.raised ? a * byVar.floor_panel.price : 0),
        summary: `${a} m²`,
        results: [['Floor area', String(a), 'm²'], ['Carpet incl. 5 % spill', (a * 1.05).toFixed(1), 'm²']]
      };
    }
  };
  const extra = [{
    id: 'c3',
    name: 'Back wall with shelving',
    category: 'Walls',
    description: 'A partition wall with wall-mounted shelves.',
    inputs: [],
    parts: 2
  }, {
    id: 'c4',
    name: 'Glass partition',
    category: 'Walls',
    description: 'Framed glass panels on a floor track.',
    inputs: []
  }, {
    id: 'c5',
    name: 'Counter',
    category: 'Furniture',
    description: 'Reception counter with a laminate top.',
    inputs: []
  }, {
    id: 'c6',
    name: 'Ceiling banner',
    category: 'Graphics',
    description: 'Printed fabric banner and rigging.',
    inputs: []
  }];
  const calculators = [wall, floor, ...extra];
  const now = Date.now();
  const quotes = [{
    id: 'q1',
    name: 'Messe Oslo stand',
    updated: '2 min ago',
    markup: 15,
    vat: 25,
    lines: [{
      id: 'l1',
      calc: 'c1',
      nickname: 'Back wall',
      values: {
        width: 4,
        height: 2.5,
        stud_spacing: '60',
        lumber: 'stud_48x98',
        spill: '10',
        sheets: 'gips_13',
        paint: 'paint_white',
        layers: 2
      }
    }, {
      id: 'l2',
      calc: 'c1',
      nickname: 'Side wall 1',
      values: {
        width: 3,
        height: 2.5,
        stud_spacing: '60',
        lumber: 'stud_48x98',
        spill: '10',
        sheets: 'gips_13',
        paint: 'paint_white',
        layers: 2
      }
    }, {
      id: 'l3',
      calc: 'c1',
      nickname: 'Gable end',
      values: {
        width: 3,
        stud_spacing: '60',
        lumber: 'stud_48x98',
        spill: '10',
        sheets: 'gips_13',
        paint: 'paint_white',
        layers: 2
      }
    }, {
      id: 'l4',
      calc: 'c2',
      nickname: '',
      values: {
        width: 6,
        depth: 4,
        carpet: 'carpet_felt',
        raised: true
      }
    }]
  }, {
    id: 'q2',
    name: 'Nor-Shipping booth',
    updated: 'yesterday',
    total: 112860,
    lineCount: 7
  }, {
    id: 'q3',
    name: 'Showroom refit',
    updated: 'Sep 28',
    total: 18940,
    lineCount: 2
  }, {
    id: 'q4',
    name: 'Untitled quote',
    updated: 'Sep 12',
    total: 0,
    lineCount: 0
  }];
  window.CE = {
    kr,
    materials,
    byVar,
    pick,
    calculators,
    quotes
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cost-estimator/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.SaveButton = __ds_scope.SaveButton;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.DashedAdd = __ds_scope.DashedAdd;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.FIELD_H = __ds_scope.FIELD_H;

__ds_ns.LABEL = __ds_scope.LABEL;

__ds_ns.ERROR = __ds_scope.ERROR;

__ds_ns.CategoryRail = __ds_scope.CategoryRail;

__ds_ns.LedgerRow = __ds_scope.LedgerRow;

__ds_ns.LedgerTable = __ds_scope.LedgerTable;

__ds_ns.RailRow = __ds_scope.RailRow;

__ds_ns.CommitBlock = __ds_scope.CommitBlock;

__ds_ns.ResultRow = __ds_scope.ResultRow;

__ds_ns.ClickTooltip = __ds_scope.ClickTooltip;

__ds_ns.ConfirmDialog = __ds_scope.ConfirmDialog;

__ds_ns.ModalDialog = __ds_scope.ModalDialog;

__ds_ns.NotificationToastCard = __ds_scope.NotificationToastCard;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.HeaderDivider = __ds_scope.HeaderDivider;

__ds_ns.PageHeader = __ds_scope.PageHeader;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.EASE = __ds_scope.EASE;

__ds_ns.T = __ds_scope.T;

__ds_ns.RING = __ds_scope.RING;

})();
