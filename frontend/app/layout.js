import './globals.css';
import Nav from '../components/Nav/Nav';
import { UserProvider } from '../lib/context/UserContext';
import { CurrencyProvider } from '../lib/context/CurrencyContext';

export const metadata = {
  title: 'Gasify — Find Cheapest Fuel Near You',
  description: 'Real-time fuel prices across Slovenia and Europe. Find the cheapest gas station near you.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <CurrencyProvider>
            <Nav />
            {children}
          </CurrencyProvider>
        </UserProvider>
      </body>
    </html>
  );
}
