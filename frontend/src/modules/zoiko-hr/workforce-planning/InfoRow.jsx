import { User, Mail, Phone, MapPin, Building2, Briefcase, Calendar, Users, Save, Edit3, X, PhoneCall, Heart } from "lucide-react";

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-2">
      <div className="p-1.5 bg-teal-50 rounded-lg"><Icon className="w-4 h-4 text-teal-600" /></div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value || "-"}</p>
      </div>
    </div>
  );
}

export { InfoRow };
