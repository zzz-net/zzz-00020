import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Applications from "@/pages/Applications";
import Triage from "@/pages/Triage";
import Waitlist from "@/pages/Waitlist";
import Slots from "@/pages/Slots";
import Confirm from "@/pages/Confirm";
import Records from "@/pages/Records";
import ExportPage from "@/pages/ExportPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/triage" element={<Triage />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/slots" element={<Slots />} />
          <Route path="/confirm" element={<Confirm />} />
          <Route path="/records" element={<Records />} />
          <Route path="/export" element={<ExportPage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="flex h-screen items-center justify-center text-xl text-slate-500">
              页面不存在
            </div>
          }
        />
      </Routes>
    </Router>
  );
}
