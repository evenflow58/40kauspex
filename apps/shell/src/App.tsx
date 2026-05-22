import React, { Suspense } from 'react'

const HomeApp = React.lazy(() => import('mfe_home/App'))

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <header style={{ borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>40K Auspex</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.875rem' }}>Shell</p>
      </header>
      <main>
        <Suspense fallback={<p>Loading remote...</p>}>
          <HomeApp />
        </Suspense>
      </main>
    </div>
  )
}
