import { AlertTriangle, CloudFog, CloudRain, Cloud, Footprints, Leaf, Sun, SunMedium, Sunrise, Sunset, Thermometer, TrendingDown, TrendingUp, Wind } from "lucide-react";

const ICONS = { rain: CloudRain, sun: Sun, cloud: Cloud, walk: Footprints, alert: AlertTriangle, uv: SunMedium, up: TrendingUp, down: TrendingDown, thermo: Thermometer, wind: Wind, fog: CloudFog, air: Leaf, sunrise: Sunrise, sunset: Sunset };

export default function Insights({ insights }) {
  if (!insights?.length) return null;

  return (
    <ul className="insights" role="list">
      {insights.map((item) => {
        const Icon = ICONS[item.icon] || Cloud;

        return (
          <li key={item.id} className={`insight insight--${item.tone}`}>
            <span className="insight__icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
