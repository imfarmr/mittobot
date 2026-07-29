import { Routes, Route, Navigate } from "react-router-dom";
import StatusView from "@/pages/views/system/StatusView";
import SettingsView from "@/pages/views/system/SettingsView";
import ModulesView from "@/pages/views/system/ModulesView";
import DataStoresView from "@/pages/views/system/DataStoresView";
import AlphaExperimentsView from "@/pages/views/system/AlphaExperimentsView";
import ThemeView from "@/pages/views/system/ThemeView";

export default function SystemHub() {
  return (
    <div className="p-6">
      <Routes>
        <Route index element={<Navigate to="status" replace />} />
        <Route path="status" element={<StatusView />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="modules" element={<ModulesView />} />
        <Route path="data" element={<DataStoresView />} />
        <Route path="experiments" element={<AlphaExperimentsView />} />
        <Route path="theme" element={<ThemeView />} />
      </Routes>
    </div>
  );
}
