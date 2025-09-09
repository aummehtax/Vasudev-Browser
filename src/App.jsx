
import { Route, Routes } from "react-router-dom"
import MainPage from "./components/pages/MainPage.jsx"

const App = () => {
  return (
<Routes>
    <Route path="/" element={<MainPage></MainPage>}></Route>
</Routes>
    
  )
}

export default App
