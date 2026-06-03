import './globals.css'
import Beams from './components/Beams'

export const metadata = {
  title: 'ScaleLab — System Design Playground',
  description: 'Production-quality implementations of URL Shortener, Rate Limiter, Distributed Cache, Job Queue, Pub/Sub and API Gateway.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ position: 'relative', background: '#050505' }}>
        <Beams />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  )
}
