import { Route, Routes } from 'react-router-dom'
import { HowToPlay } from './components/HowToPlay'
import { Landing } from './components/Landing'
import { RoomPage } from './components/RoomPage'

export function App() {
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/how-to-play" element={<HowToPlay />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Landing missing />} />
      </Routes>
    </>
  )
}
