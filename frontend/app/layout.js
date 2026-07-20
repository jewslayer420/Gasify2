import './globals.css';
import Nav from '../components/Nav/Nav';
import { UserProvider } from '../lib/context/UserContext';
import { CurrencyProvider } from '../lib/context/CurrencyContext';
import { UnitsProvider } from '../lib/context/UnitsContext';
import { ThemeProvider, STORAGE_KEY as THEME_STORAGE_KEY } from '../lib/context/ThemeContext';

export const metadata = {
  title: 'Gasify — Find Cheapest Fuel Near You',
  description: 'Real-time fuel prices across Slovenia and Europe. Find the cheapest gas station near you.',
};

// Runs before hydration so the page paints in the right theme immediately —
// without this, dark-mode visitors would see a light flash on every load.
const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var t=s==='dark'||s==='light'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <ThemeProvider>
          <UserProvider>
            <UnitsProvider>
              <CurrencyProvider>
                <Nav />
                {children}
              </CurrencyProvider>
            </UnitsProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
