/** A menu of exclusive choices: the current one is marked. */
export function RadioMenu<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`shell-menu${className ? ` ${className}` : ""}`}
      role="menu"
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="menuitemradio"
          aria-checked={o === value}
          className="shell-menu-row"
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
