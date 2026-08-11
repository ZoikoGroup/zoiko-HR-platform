import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function Layout({ children, showHeader = true, showSidebar = true }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {showSidebar && <Sidebar />}
      <div className="lg:pl-72">
        {showHeader && <Header />}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
