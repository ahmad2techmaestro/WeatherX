import { Bug, CarFront, Dumbbell, Smile, Sun, TreePalm, Wrench } from "lucide-react";

const ICONS = { uv: Sun, skin: Smile, carwash: Wrench, workout: Dumbbell, driving: CarFront, trip: TreePalm, mosquito: Bug };

/** Everyday guidance tiles (sun care, skin, car wash, workout, driving, trips, mosquitoes). */
export default function Lifestyle({ data }) {
  const tips = data.intelligence?.lifestyle;

  if (!tips?.length) return null;

  return (
    <ul className="life" role="list">
      {tips.map((t) => {
        const Icon = ICONS[t.key] || Sun;

        return (
          <li key={t.key} data-tone={t.tone}>
            <span className="life__icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            <div>
              <small>{t.title}</small>
              <strong>{t.label}</strong>
              <p>{t.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
