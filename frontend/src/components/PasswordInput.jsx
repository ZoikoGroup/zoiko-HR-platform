/**
 * components/PasswordInput.jsx
 * ----------------------------
 * A password box with its own show/hide eye button (A2, A3). Every password field in the app uses it, so
 * each field has independent visibility: revealing "New password" never reveals "Confirm new password".
 *
 * - The eye is type="button" so it never submits the form; aria-label says what it will do, aria-pressed
 *   says whether the password is visible; it is a normal focusable button (Tab, Enter, Space).
 * - Pressing it with a mouse/finger does not steal focus from the input, so the caret stays where it was.
 * - Everything else (id, value, onChange, autoComplete, aria-*, placeholder, …) goes to the <input>.
 *
 * Styling: `className`/`style` style the input (right padding is added for the button); `wrapperClassName`/
 * `wrapperStyle` style the positioning wrapper; `toggleClassName`/`toggleStyle` style the button; `leading`
 * is an optional decoration rendered before the input (e.g. a lock icon).
 */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const TOGGLE_STYLE = {
  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: "28px", height: "28px", padding: 0, border: 0, borderRadius: "4px",
  background: "transparent", color: "#64748B", cursor: "pointer",
};

export default function PasswordInput({
  ref,
  className,
  style,
  wrapperClassName,
  wrapperStyle,
  toggleClassName,
  toggleStyle,
  iconSize = 18,
  leading = null,
  disabled,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={wrapperClassName} style={{ position: "relative", ...wrapperStyle }}>
      {leading}
      <input
        ref={ref}
        {...inputProps}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={className}
        style={{ paddingRight: "44px", ...style }}
      />
      <button
        type="button"
        className={toggleClassName}
        style={toggleClassName ? toggleStyle : { ...TOGGLE_STYLE, ...toggleStyle }}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputProps.id}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={iconSize} aria-hidden="true" /> : <Eye size={iconSize} aria-hidden="true" />}
      </button>
    </div>
  );
}
