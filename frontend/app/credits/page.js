import styles from './page.module.css';

export const metadata = {
  title: 'Data Sources & Credits — Gasify',
  description: 'Where Gasify fuel prices and map data come from, with licences and attributions.',
};

// Distilled from docs/DATA_SOURCES.md — keep the two in sync when adding countries.
const MAP_CREDITS = [
  { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', note: 'Map data and fuel-station locations, © OpenStreetMap contributors, licensed under ODbL.' },
  { name: 'MapTiler', url: 'https://www.maptiler.com/copyright/', note: 'Map tiles, styling and geocoding.' },
];

const GROUPS = [
  {
    title: 'Per-station government & official data',
    sources: [
      { region: 'France', name: 'Ministère de l’Économie — Prix des carburants', licence: 'Licence Ouverte / Etalab 2.0', url: 'https://data.economie.gouv.fr' },
      { region: 'Spain', name: 'Ministerio — Geoportal Gasolineras', licence: 'Spanish government open data', url: 'https://sedeaplicaciones.minetur.gob.es' },
      { region: 'Italy', name: 'MIMIT — Osservatorio prezzi carburanti', licence: 'Italian open data', url: 'https://www.mimit.gov.it' },
      { region: 'Portugal', name: 'DGEG — Preços de Combustíveis', licence: 'Portuguese government open data', url: 'https://precoscombustiveis.dgeg.gov.pt' },
      { region: 'Austria', name: 'E-Control Spritpreisrechner', licence: 'Austrian official price transparency service', url: 'https://www.spritpreisrechner.at' },
      { region: 'Slovenia', name: 'goriva.si', licence: 'Regulated prices via goriva.si', url: 'https://goriva.si' },
      { region: 'United Kingdom', name: 'UK Fuel Finder scheme', licence: 'Open Government Licence v3', url: 'https://www.gov.uk' },
      { region: 'Finland', name: 'polttoaine.net', licence: 'Community price data', url: 'https://www.polttoaine.net' },
      { region: 'Iceland', name: 'Gasvaktin', licence: 'Open-source project', url: 'https://github.com/gasvaktin/gasvaktin' },
      { region: 'Luxembourg', name: 'STATEC — official maximum prices (LUSTAT)', licence: 'CC0', url: 'https://lustat.statec.lu' },
      { region: 'Chile', name: 'CNE — Bencina en Línea', licence: 'Chilean government API', url: 'https://api.cne.cl' },
      { region: 'Taiwan', name: 'CPC Corporation open data', licence: 'Taiwanese government open data', url: 'https://www.cpc.com.tw' },
      { region: 'Mexico', name: 'CRE — Comisión Reguladora de Energía', licence: 'Mexican government open data', url: 'https://www.gob.mx/cre' },
      { region: 'Australia', name: 'NSW FuelCheck · WA FuelWatch · TAS FuelCheck', licence: 'State government APIs', url: 'https://www.fuelcheck.nsw.gov.au' },
      { region: 'Argentina', name: 'Secretaría de Energía', licence: 'Argentine open data', url: 'https://datos.energia.gob.ar' },
    ],
  },
  {
    title: 'National average prices (applied to all stations in the country)',
    sources: [
      { region: 'EU — 18 countries (BE BG CY CZ DE DK EE GR HR HU IE LT LV MT NL PL RO SK)', name: 'European Commission — Weekly Oil Bulletin', licence: 'CC BY 4.0', url: 'https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en' },
      { region: 'United States', name: 'U.S. Energy Information Administration (EIA)', licence: 'U.S. Government public domain', url: 'https://www.eia.gov' },
      { region: 'Canada', name: 'Ontario Open Government / Statistics Canada', licence: 'Open Government Licence — Canada', url: 'https://open.canada.ca' },
      { region: 'Brazil', name: 'ANP — Agência Nacional do Petróleo', licence: 'Brazilian government open data', url: 'https://www.gov.br/anp' },
      { region: 'Turkey', name: 'EPDK — Energy Market Regulatory Authority', licence: 'Turkish regulator bulletin', url: 'https://www.epdk.gov.tr' },
      { region: 'Malaysia', name: 'data.gov.my — fuel price catalogue', licence: 'CC BY 4.0', url: 'https://data.gov.my' },
      { region: 'New Zealand', name: 'MBIE — weekly fuel price monitoring', licence: 'CC BY 4.0', url: 'https://www.mbie.govt.nz' },
      { region: 'Thailand', name: 'Thai oil price API (per-brand board prices)', licence: 'Community API', url: 'https://github.com/chnwt/thai-oil-api' },
      { region: 'South Africa', name: 'DMPR — regulated national fuel price', licence: 'Official published price', url: 'https://www.dmpr.gov.za' },
    ],
  },
  {
    title: 'Regulated / official national prices (published facts, updated by hand)',
    sources: [
      { region: 'United Arab Emirates', name: 'UAE Fuel Price Committee (monthly)', licence: 'Official published price' },
      { region: 'Saudi Arabia', name: 'Saudi Aramco retail prices', licence: 'Official published price' },
      { region: 'Qatar', name: 'QatarEnergy (monthly)', licence: 'Official published price' },
      { region: 'Kuwait', name: 'KPC / Ministry of Electricity & Water', licence: 'Official published price' },
      { region: 'Oman', name: 'Monthly fuel price cap', licence: 'Official published price' },
      { region: 'Bahrain', name: 'NOGA official prices', licence: 'Official published price' },
      { region: 'Brunei', name: 'Subsidised price scheme', licence: 'Official published price' },
      { region: 'Kenya', name: 'EPRA maximum pump prices (monthly)', licence: 'Official published price' },
      { region: 'Dominican Republic', name: 'MICM weekly official prices', licence: 'Official published price' },
      { region: 'Uruguay', name: 'ANCAP national prices', licence: 'Official published price' },
      { region: 'Ecuador', name: 'Official price-band scheme', licence: 'Official published price' },
      { region: 'Serbia', name: 'Ministry of Internal & Foreign Trade — weekly maximum prices', licence: 'Official published price' },
      { region: 'Montenegro', name: 'Ministry of Energy — price decrees', licence: 'Official published price' },
      { region: 'Albania', name: 'Bordi i Transparencës — maximum prices', licence: 'Official published price' },
      { region: 'North Macedonia', name: 'ERC — Energy Regulatory Commission', licence: 'Official published price', url: 'https://erc.org.mk' },
      { region: 'Switzerland', name: 'National average retail price (market)', licence: 'Published market average' },
      { region: 'Bosnia & Herzegovina', name: 'National average retail price (market)', licence: 'Published market average' },
    ],
  },
];

export default function CreditsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Data Sources & Credits</h1>
        <p className={styles.sub}>
          Gasify aggregates fuel prices from official and open data sources. Prices are
          informational — always check the pump. Where a country publishes a single national
          or regulated price, that price is shown for every station in the country.
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.groupTitle}>Map</h2>
        <div className={styles.list}>
          {MAP_CREDITS.map(c => (
            <div key={c.name} className={styles.item}>
              <div>
                <div className={styles.sourceName}>
                  © <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
                </div>
                <div className={styles.note}>{c.note}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {GROUPS.map(g => (
        <section key={g.title} className={styles.section}>
          <h2 className={styles.groupTitle}>{g.title}</h2>
          <div className={styles.list}>
            {g.sources.map(s => (
              <div key={s.region} className={styles.item}>
                <div className={styles.itemLeft}>
                  <div className={styles.region}>{s.region}</div>
                  <div className={styles.sourceName}>
                    {s.url
                      ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
                      : s.name}
                  </div>
                </div>
                <div className={styles.licence}>{s.licence}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className={styles.disclaimer}>
        Station locations are derived from OpenStreetMap (© OpenStreetMap contributors, ODbL).
        Government data is reproduced under the respective open licences; the data providers do
        not endorse Gasify. Currency conversions to EUR use current exchange rates and are
        approximate.
      </p>
    </div>
  );
}
