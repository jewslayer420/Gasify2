import './globals.css';
import 'leaflet/dist/leaflet.css';
import Nav from '../components/Nav/Nav';
import { UserProvider } from '../lib/context/UserContext';

export const metadata = {
  title: 'Gasify — Find Cheapest Fuel Near You',
  description: 'Real-time fuel prices across Slovenia and Europe. Find the cheapest gas station near you.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <Nav />
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
