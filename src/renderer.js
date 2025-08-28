
        // Simple admin login using document.getElementById
        let isAdmin = false;
        let autoLogoutMinutes = 30;
        const SESSION_KEY = 'oplokal_session';
        const APP_VERSION = '0.02.15.04';

        function getStoredTimeout(email) {
            const val = localStorage.getItem(`autoLogoutMinutes_${email}`);
            return val ? parseInt(val, 10) : 30;
        }

        function setStoredTimeout(email, minutes) {
            localStorage.setItem(`autoLogoutMinutes_${email}`, String(minutes));
        }

        function saveSession() {
            if (!app || !app.currentUser) return;
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                user: app.currentUser,
                isAdmin,
                autoLogoutMinutes,
                lastActivity: Date.now()
            }));
        }

        function restoreSession() {
            const data = localStorage.getItem(SESSION_KEY);
            if (!data) return;
            const session = JSON.parse(data);
            const timeout = session.autoLogoutMinutes || 30;
            const elapsed = Date.now() - (session.lastActivity || 0);
            if (elapsed < timeout * 60000) {
                isAdmin = session.isAdmin;
                autoLogoutMinutes = timeout;
                app.currentUser = session.user;
                document.getElementById('loginModal').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                toggleAdminFeatures();
                updateActivity();
            } else {
                localStorage.removeItem(SESSION_KEY);
            }
        }

        function updateActivity() {
            if (!app || !app.currentUser) return;
            const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
            session.lastActivity = Date.now();
            session.autoLogoutMinutes = autoLogoutMinutes;
            session.user = app.currentUser;
            session.isAdmin = isAdmin;
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }

        function logoutUser() {
            localStorage.removeItem(SESSION_KEY);
            document.getElementById('app').classList.add('hidden');
            document.getElementById('loginModal').classList.remove('hidden');
            document.getElementById('settings-modal').classList.remove('active');
            isAdmin = false;
            app.currentUser = null;
            toggleAdminFeatures();
           updateUserMenu();
        }

        function updateUserMenu() {
            const btn = document.getElementById('user-menu-button');
            const nameEl = document.getElementById('user-menu-name');
            const menu = document.getElementById('user-menu-dropdown');
            if (btn && nameEl && menu) {
                if (app && app.currentUser) {
                    btn.classList.remove('hidden');
                    nameEl.textContent = app.currentUser.name || 'Nutzer';
                } else {
                    btn.classList.add('hidden');
                    nameEl.textContent = 'Nutzer';
                    menu.classList.add('hidden');
                }
            }
        }

        ['click','mousemove','keydown','scroll'].forEach(evt => {
            document.addEventListener(evt, updateActivity, {passive:true});
        });

        setInterval(() => {
            const data = localStorage.getItem(SESSION_KEY);
            if (!data) return;
            const session = JSON.parse(data);
            const timeout = (session.autoLogoutMinutes || 30) * 60000;
            if (Date.now() - (session.lastActivity || 0) > timeout) {
                logoutUser();
            }
        }, 60000);

        document.getElementById('loginBtn').addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            if (!app) {
                alert('System noch nicht bereit');
                return;
            }
            const users = await app.db.getAll('users');
            const user = users.find(u => u.email === email && u.password === pass);
            if (user) {
                isAdmin = user.role === 'admin';
                app.currentUser = user;
                autoLogoutMinutes = getStoredTimeout(user.email);
                document.getElementById('loginModal').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                toggleAdminFeatures();
                saveSession();
                updateActivity();
                updateUserMenu();
            } else {
                alert('Ungültige Zugangsdaten');
            }
        });

        function toggleAdminFeatures() {
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.classList.toggle('hidden', !isAdmin);
                if ('disabled' in el) {
                    el.disabled = !isAdmin;
                }
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            toggleAdminFeatures();
        });

        // =====================================
        // === Utility: prevent double form submission ===
        function preventDoubleSubmit(formId){    try {
        const form = document.getElementById(formId);
        if(!form) return;
        form.addEventListener('submit', (e) => {
            const btn = form.querySelector('button[type="submit"], input[type="submit"]');
            if (btn && btn.dataset.submitting === '1') {
                e.preventDefault();
                return;
            }
            if (btn) {
                btn.dataset.submitting = '1';
                btn.disabled = true;
                setTimeout(() => {
                    btn.disabled = false;
                    btn.dataset.submitting = '0';
                }, 1500);
            }
        }, { capture: true });
    } catch (err) {
        console.warn('preventDoubleSubmit setup failed for', formId, err);
    }
}

// DATABASE MANAGEMENT (IndexedDB)
        // =====================================
        
        class OptisparDB {
            constructor() {
                this.db = null;
                this.version = 4;
            }

            async init() {
                console.log('Initializing OptisparApp with Bestellungen support...');
                return new Promise((resolve, reject) => {
                    // Erhöhe Version für Bestellungen Support
                    const request = indexedDB.open('OptisparStandalone', 4);
                    
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        this.db = request.result;
                        resolve();
                    };
                    
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        
                        // Create stores
                        if (!db.objectStoreNames.contains('konten')) {
                            const kontenStore = db.createObjectStore('konten', { keyPath: 'nummer' });
                            kontenStore.createIndex('kategorie', 'kategorie', { unique: false });
                        }
                        
                        if (!db.objectStoreNames.contains('buchungen')) {
                            const buchungenStore = db.createObjectStore('buchungen', { keyPath: 'id' });
                            buchungenStore.createIndex('datum', 'datum', { unique: false });
                        }
                        
                        if (!db.objectStoreNames.contains('waren')) {
                            const warenStore = db.createObjectStore('waren', { keyPath: 'id' });
                            warenStore.createIndex('name', 'name', { unique: false });
                        }
                        
                        if (!db.objectStoreNames.contains('lagerbewegungen')) {
                            const bewegungenStore = db.createObjectStore('lagerbewegungen', { keyPath: 'id' });
                            bewegungenStore.createIndex('waren_id', 'waren_id', { unique: false });
                        }
                        
                        if (!db.objectStoreNames.contains('bestellungen')) {
                            const bestellungenStore = db.createObjectStore('bestellungen', { keyPath: 'id' });
                            bestellungenStore.createIndex('datum', 'datum', { unique: false });
                            bestellungenStore.createIndex('haendler', 'haendler', { unique: false });
                        }
                        
                        if (!db.objectStoreNames.contains('users')) {
                            const userStore = db.createObjectStore('users', { keyPath: 'id' });
                            userStore.createIndex('email', 'email', { unique: true });
                        }
                        // Seed initial data
                        setTimeout(() => this.seedInitialData(), 100);
                    };
                });
            }
 
            async seedInitialData() {
               // Seed default admin user
                const userCount = await this.count('users');
                if (userCount === 0) {
                    await this.add('users', {
                        name: 'Admin',
                        geburtsdatum: '1990-01-01',
                        kuerzel: 'ADM',
                        bereich: 'IT',
                        email: 'admin@example.com',
                        password: 'admin123',
                        role: 'admin'
                    });
                }

                // Check if data already exists
                const kontenCount = await this.count('konten');
                if (kontenCount > 0) return;

                // SKR03 Kontenrahmen
                const konten = [
                    { nummer: 1000, name: 'Kasse', typ: 'Aktiv', kategorie: 'Zahlungsmittel', aktiv: true },
                    { nummer: 1010, name: 'Postbank', typ: 'Aktiv', kategorie: 'Zahlungsmittel', aktiv: true },
                    { nummer: 1020, name: 'Kasse Filiale 1', typ: 'Aktiv', kategorie: 'Zahlungsmittel', aktiv: true },
                    { nummer: 1200, name: 'Bank', typ: 'Aktiv', kategorie: 'Zahlungsmittel', aktiv: true },
                    { nummer: 1210, name: 'Bundesbank', typ: 'Aktiv', kategorie: 'Zahlungsmittel', aktiv: true },
                    { nummer: 1300, name: 'Schecks', typ: 'Aktiv', kategorie: 'Zahlungsmittel', aktiv: true },
                    { nummer: 1400, name: 'Forderungen aus Lieferungen und Leistungen', typ: 'Aktiv', kategorie: 'Forderungen', aktiv: true },
                    { nummer: 1401, name: 'Forderungen aus Lieferungen und Leistungen (EU)', typ: 'Aktiv', kategorie: 'Forderungen', aktiv: true },
                    { nummer: 1410, name: 'Forderungen gegen Gesellschafter', typ: 'Aktiv', kategorie: 'Forderungen', aktiv: true },
                    { nummer: 1450, name: 'Zweifelhafte Forderungen', typ: 'Aktiv', kategorie: 'Forderungen', aktiv: true },
                    { nummer: 1500, name: 'Sonstige Vermögensgegenstände', typ: 'Aktiv', kategorie: 'Umlaufvermögen', aktiv: true },
                    { nummer: 1600, name: 'Vorräte', typ: 'Aktiv', kategorie: 'Umlaufvermögen', aktiv: true },
                    { nummer: 1610, name: 'Rohstoffe', typ: 'Aktiv', kategorie: 'Umlaufvermögen', aktiv: true },
                    { nummer: 1620, name: 'Hilfsstoffe', typ: 'Aktiv', kategorie: 'Umlaufvermögen', aktiv: true },
                    { nummer: 1630, name: 'Betriebsstoffe', typ: 'Aktiv', kategorie: 'Umlaufvermögen', aktiv: true },

                    // Steuerkonten
                    { nummer: 1571, name: 'Vorsteuer 7%', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1575, name: 'Vorsteuer 16%', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1576, name: 'Vorsteuer 19%', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1577, name: 'Einfuhrumsatzsteuer', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1771, name: 'Umsatzsteuer 7%', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1775, name: 'Umsatzsteuer 16%', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1776, name: 'Umsatzsteuer 19%', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },
                    { nummer: 1779, name: 'Umsatzsteuer-Vorauszahlungen', typ: 'Steuer', kategorie: 'Steuer', aktiv: true },

                    // Passivkonten
                    { nummer: 2000, name: 'Eigenkapital', typ: 'Passiv', kategorie: 'Eigenkapital', aktiv: true },
                    { nummer: 2050, name: 'Privatentnahmen', typ: 'Passiv', kategorie: 'Eigenkapital', aktiv: true },
                    { nummer: 2100, name: 'Gewinnvortrag', typ: 'Passiv', kategorie: 'Eigenkapital', aktiv: true },
                    { nummer: 2200, name: 'Verlustvortrag', typ: 'Passiv', kategorie: 'Eigenkapital', aktiv: true },
                    { nummer: 3000, name: 'Verbindlichkeiten gegenüber Kreditinstituten', typ: 'Passiv', kategorie: 'Fremdkapital', aktiv: true },
                    { nummer: 3200, name: 'Verbindlichkeiten aus Lieferungen und Leistungen', typ: 'Passiv', kategorie: 'Fremdkapital', aktiv: true },
                    { nummer: 3300, name: 'Verbindlichkeiten aus Lieferungen und Leistungen', typ: 'Passiv', kategorie: 'Fremdkapital', aktiv: true },
                    { nummer: 3400, name: 'Empfangene Anzahlungen', typ: 'Passiv', kategorie: 'Fremdkapital', aktiv: true },

                    // Ertragskonten
                    { nummer: 4000, name: 'Umsatzerlöse 19%', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },
                    { nummer: 4001, name: 'Umsatzerlöse 19% innergem. Lieferung', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },
                    { nummer: 4007, name: 'Umsatzerlöse 7%', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },
                    { nummer: 4300, name: 'Erträge aus Anlagevermögen', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },
                    { nummer: 4400, name: 'Erträge aus anderen Wertpapieren', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },
                    { nummer: 4800, name: 'Mieterträge', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },
                    { nummer: 4900, name: 'Bestandsveränderungen', typ: 'Ertrag', kategorie: 'Erträge', aktiv: true },

                    // Aufwandskonten - Wareneinsatz
                    { nummer: 5000, name: 'Wareneingang', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 5200, name: 'Wareneinsatz 19%', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 5201, name: 'Wareneinsatz 7%', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 5400, name: 'Bezugsnebenkosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 5800, name: 'Bestandsveränderung Waren', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },

                    // Aufwandskonten - Personal
                    { nummer: 6000, name: 'Löhne und Gehälter', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6020, name: 'Gehälter', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6030, name: 'Löhne', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6100, name: 'Gesetzliche soziale Aufwendungen', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6200, name: 'Beiträge zur Berufsgenossenschaft', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },

                    // Aufwandskonten - Betriebsausgaben
                    { nummer: 6300, name: 'Mieten und Pachten für Räume', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6400, name: 'Abschreibungen auf Sachanlagen', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6500, name: 'Reparaturen und Instandhaltung', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6600, name: 'Werbekosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6700, name: 'Bürobedarf', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6800, name: 'Porto, Telefon, Internet', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6820, name: 'Rechts- und Beratungskosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6840, name: 'Versicherungen', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6850, name: 'Beiträge', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6900, name: 'Reisekosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 6920, name: 'Fortbildungskosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },

                    // Weitere Aufwandskonten
                    { nummer: 7000, name: 'Zinsen und ähnliche Aufwendungen', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7030, name: 'Zinsaufwendungen für Bankkredite', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7200, name: 'Kfz-Kosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7300, name: 'Bewirtungskosten', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7320, name: 'Geschenke', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7400, name: 'Sonstige betriebliche Aufwendungen', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7500, name: 'Verluste aus dem Abgang von Vermögensgegenständen', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7600, name: 'Büro- und Verwaltungsaufwand', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7700, name: 'Versorgungsaufwand', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },
                    { nummer: 7790, name: 'Sonstige Steuern', typ: 'Aufwand', kategorie: 'Aufwendungen', aktiv: true },

                    // Abschlusskonten
                    { nummer: 8000, name: 'Privatentnahmen Sachentnahme', typ: 'Passiv', kategorie: 'Eigenkapital', aktiv: true },
                    { nummer: 8800, name: 'Eigenverbrauch', typ: 'Ertrag', kategorie: 'Eigenkapital', aktiv: true },
                    { nummer: 9000, name: 'GuV-Konto', typ: 'Erfolg', kategorie: 'Abschluss', aktiv: true },
                    { nummer: 9999, name: 'Schlussbilanzkonto', typ: 'Abschluss', kategorie: 'Abschluss', aktiv: true }
                ];

                // Konten erstellen
                for (const konto of konten) {
                    await this.add('konten', konto);
                }

                console.log(`${konten.length} SKR03-Konten erstellt`);

                // Add sample products
                const produkte = [
                    {
                        name: "Business-Laptop",
                        beschreibung: "Professioneller Laptop für Büroarbeiten",
                        artikelnummer: "LAP-001",
                        kategorie: "Elektronik",
                        preis_netto: 800.00,
                        preis_netto_cent: 80000,
                        preis_brutto_cent: 95200,
                        mwst_satz: 19,
                        bestand: 12,
                        mindestbestand: 3,
                        lieferant: "TechWorld GmbH",
                        aktiv: true
                    },
                    {
                        name: "Ergonomischer Stuhl",
                        beschreibung: "Bürostuhl mit Lendenwirbelstütze",
                        artikelnummer: "STU-002",
                        kategorie: "Büromöbel",
                        preis_netto: 250.00,
                        preis_netto_cent: 25000,
                        preis_brutto_cent: 29750,
                        mwst_satz: 19,
                        bestand: 8,
                        mindestbestand: 2,
                        lieferant: "Möbelhaus Schmidt",
                        aktiv: true
                    },
                    {
                        name: "Druckerpapier A4",
                        beschreibung: "500 Blatt 80g/m² Kopierpapier",
                        artikelnummer: "PAP-003",
                        kategorie: "Bürobedarf",
                        preis_netto: 3.50,
                        preis_netto_cent: 350,
                        preis_brutto_cent: 417,
                        mwst_satz: 19,
                        bestand: 1,
                        mindestbestand: 10,
                        lieferant: "Office Supplies AG",
                        aktiv: true
                    }
                ];

                for (const produkt of produkte) {
                    await this.add('waren', produkt);
                }

                console.log('Initial data seeded successfully');
            }

            async add(storeName, data) {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                // Generate ID if needed
                if (data.id === undefined && storeName !== 'konten') {
                    data.id = this.generateUUID();
                }
                
                // Add timestamps
                data.created_at = new Date().toISOString();
                data.updated_at = new Date().toISOString();
                
                return new Promise((resolve, reject) => {
                    const request = store.add(data);
                    request.onsuccess = () => resolve(data.id || data.nummer);
                    request.onerror = () => reject(request.error);
                });
            }

            async put(storeName, data) {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                data.updated_at = new Date().toISOString();
                
                return new Promise((resolve, reject) => {
                    const request = store.put(data);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async get(storeName, key) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                
                return new Promise((resolve, reject) => {
                    const request = store.get(key);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async getAll(storeName) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                
                return new Promise((resolve, reject) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async delete(storeName, key) {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                return new Promise((resolve, reject) => {
                    const request = store.delete(key);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            async count(storeName) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                
                return new Promise((resolve, reject) => {
                    const request = store.count();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            generateUUID() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        }

        // =====================================
        // APPLICATION CLASS
        // =====================================

        class OptisparApp {
            constructor() {
                this.db = new OptisparDB();
                this.currentBookingType = null;
                this.currentProduct = null;
                this.isEditingProduct = false;
                this.deleteCallback = null;
                this.editingBuchungId = null;
            }

            async init() {
                try {
                    await this.db.init();
                    lucide.createIcons();
                    
                    // Set today's date
                    const today = new Date().toISOString().split('T')[0];
                    const dateInput = document.getElementById('booking-datum');
                    if (dateInput) dateInput.value = today;
                    
                    // Load all data
                    await this.refreshAll();
                    
                    showNotification('Optispar erfolgreich geladen!', 'success');
                    console.log('Optispar App initialized successfully');
                } catch (error) {
                    console.error('Error initializing app:', error);
                    showNotification('Fehler beim Laden der Anwendung', 'error');
                }
            }

            async refreshAll() {
                await Promise.all([
                    this.loadDashboard(),
                    this.loadBuchungen(),
                    this.loadWaren(),
                    this.loadBewegungen(),
                    loadKonten(),
                    this.loadRecentActivities()
                ]);
            }

            async loadDashboard() {
                try {
                    const buchungen = await this.db.getAll('buchungen');
                    const waren = await this.db.getAll('waren');
                    
                    console.log('Raw buchungen data:', buchungen);
                    
                    // Calculate daily bookings
                    const today = new Date().toISOString().split('T')[0]; // 2025-08-21
                    const dailyBookings = buchungen.filter(buchung => {
                        const buchungDate = buchung.datum || buchung.date;
                        return buchungDate && buchungDate.startsWith(today);
                    });
                    
                    console.log('Daily bookings found:', dailyBookings.length, 'for date:', today);
                    
                    // Update daily counter
                    this.updateElement('daily-booking-count', dailyBookings.length.toString());
                    
                    // Calculate monthly and yearly figures
                    let einnahmenMonat = 0, ausgabenMonat = 0;
                    let einnahmenJahr = 0, ausgabenJahr = 0;
                    
                    const thisMonth = new Date().toISOString().substr(0, 7); // 2025-01
                    const thisYear = new Date().getFullYear().toString(); // 2025
                    
                    buchungen.forEach(buchung => {
                        // Fix: Use correct date field name
                        const buchungDate = buchung.datum || buchung.date;
                        if (!buchungDate) {
                            console.warn('Buchung without date:', buchung);
                            return;
                        }
                        
                        const buchungMonth = buchungDate.substr(0, 7);
                        const buchungYear = buchungDate.substr(0, 4);
                        const betrag = buchung.betrag_brutto_cent || 0;
                        
                        // Add validation
                        if (!betrag || isNaN(betrag)) {
                            console.warn('Invalid betrag_brutto_cent:', buchung);
                            return;
                        }
                        
                        console.log(`Processing buchung: ${buchung.beschreibung}, ${buchung.typ}, ${betrag} cents, date: ${buchungDate}`);
                        
                        // Yearly calculations
                        if (buchungYear === thisYear) {
                            if (buchung.typ === 'einnahme') {
                                einnahmenJahr += betrag;
                            } else if (buchung.typ === 'ausgabe') {
                                ausgabenJahr += betrag;
                            }
                        }
                        
                        // Monthly calculations
                        if (buchungMonth === thisMonth) {
                            if (buchung.typ === 'einnahme') {
                                einnahmenMonat += betrag;
                            } else if (buchung.typ === 'ausgabe') {
                                ausgabenMonat += betrag;
                            }
                        }
                    });
                    
                    console.log(`Calculated amounts - Monat: E${einnahmenMonat}, A${ausgabenMonat} - Jahr: E${einnahmenJahr}, A${ausgabenJahr}`);
                    
                    const gewinnMonat = einnahmenMonat - ausgabenMonat;
                    const gewinnJahr = einnahmenJahr - ausgabenJahr;
                    const lagerwert = waren.reduce((sum, ware) => sum + ((ware.bestand || 0) * (ware.preis_netto_cent || 0)), 0);
                    const lowStockWaren = waren.filter(w => (w.bestand || 0) <= (w.mindestbestand || 0));
                    const gesamtbestand = waren.reduce((sum, ware) => sum + (ware.bestand || 0), 0);
                    
                    // Update main KPIs
                    this.updateElement('kpi-umsatz-monat', this.formatCurrency(einnahmenMonat));
                    this.updateElement('kpi-umsatz-jahr', this.formatCurrency(einnahmenJahr));
                    this.updateElement('kpi-kosten-monat', this.formatCurrency(ausgabenMonat));
                    this.updateElement('kpi-kosten-jahr', this.formatCurrency(ausgabenJahr));
                    this.updateElement('kpi-gewinn-monat', this.formatCurrency(gewinnMonat));
                    this.updateElement('kpi-gewinn-jahr', this.formatCurrency(gewinnJahr));
                    this.updateElement('kpi-lagerwert', this.formatCurrency(lagerwert));
                    
                    // Update inventory KPIs
                    this.updateElement('kpi-produktarten', waren.length.toString());
                    this.updateElement('kpi-gesamtbestand', gesamtbestand + ' Stk.');
                    this.updateElement('kpi-niedrige-bestaende', lowStockWaren.length.toString());
                    
                    // Update overview
                    this.updateElement('total-bookings', buchungen.length.toString());
                    this.updateElement('total-products', waren.length.toString());
                    this.updateElement('low-stock-products', lowStockWaren.length.toString());
                    
                    // Update Lager tab KPIs
                    this.updateElement('lager-gesamtwert', this.formatCurrency(lagerwert));
                    this.updateElement('lager-produktarten', waren.length.toString());
                    this.updateElement('lager-gesamtbestand', gesamtbestand + ' Stk.');
                    this.updateElement('lager-niedrige-bestaende', lowStockWaren.length.toString());
                    
                    // Load Konten
                    await loadKonten();
                    
                    // Load booking accounts for modals
                    await loadBookingAccounts();
                    
                    console.log('Dashboard loaded successfully:', {
                        einnahmenMonat: this.formatCurrency(einnahmenMonat),
                        ausgabenMonat: this.formatCurrency(ausgabenMonat),
                        gewinnMonat: this.formatCurrency(gewinnMonat),
                        einnahmenJahr: this.formatCurrency(einnahmenJahr),
                        ausgabenJahr: this.formatCurrency(ausgabenJahr),
                        gewinnJahr: this.formatCurrency(gewinnJahr),
                        totalBuchungen: buchungen.length,
                        totalWaren: waren.length
                    });
                    
                } catch (error) {
                    console.error('Error loading dashboard:', error);
                }
            }

            // Buchungen Methods
            async loadBuchungen() {
                try {
                    const buchungen = await this.db.getAll('buchungen');
                    buchungen.sort((a, b) => new Date(b.datum) - new Date(a.datum));
                    this.displayBuchungen(buchungen);
                } catch (error) {
                    console.error('Error loading buchungen:', error);
                }
            }

            displayBuchungen(buchungen) {
                const container = document.getElementById('buchungen-list');
                if (!container) return;

                if (buchungen.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-8 text-gray-500">
                            <div class="text-4xl mb-4">📄</div>
                            <p>Keine Buchungen gefunden.</p>
                            <p class="text-sm">Ändern Sie die Filter oder erstellen Sie neue Buchungen.</p>
                        </div>
                    `;
                    return;
                }

                let html = '';
                buchungen.forEach(buchung => {
                    const badgeClass = buchung.typ === 'einnahme' ? 'badge-success' : 'badge-danger';
                    const typeText = buchung.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe';
                    const typeIcon = buchung.typ === 'einnahme' ? 'plus-circle' : 'minus-circle';
                    const typeColor = buchung.typ === 'einnahme' ? 'text-green-600' : 'text-red-600';
                    
                    // Get account name
                    const accountName = this.getAccountName(buchung.account);
                    
                    html += `
                        <div class="card p-4 hover:shadow-lg transition-shadow">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-2">
                                        <i data-lucide="${typeIcon}" class="h-4 w-4 ${typeColor}"></i>
                                        <h4 class="font-semibold text-gray-900">${buchung.beschreibung}</h4>
                                        <span class="px-2 py-1 text-xs rounded-full bg-${buchung.typ === 'einnahme' ? 'green' : 'red'}-100 text-${buchung.typ === 'einnahme' ? 'green' : 'red'}-800">
                                            ${typeText}
                                        </span>
                                    </div>
                                    <div class="text-sm text-gray-500 space-y-1">
                                        <p><i data-lucide="calendar" class="h-3 w-3 inline mr-1"></i>
                                            ${new Date(buchung.datum).toLocaleDateString('de-DE')}
                                        </p>
                                        ${buchung.account ? `
                                            <p><i data-lucide="book-open" class="h-3 w-3 inline mr-1"></i>
                                                <span class="font-medium">${buchung.account}</span> - ${accountName}
                                            </p>
                                        ` : ''}
                                        ${buchung.kategorie ? `
                                            <p><i data-lucide="tag" class="h-3 w-3 inline mr-1"></i>
                                                ${buchung.kategorie}
                                            </p>
                                        ` : ''}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-2xl font-bold ${typeColor} mb-1">
                                        ${this.formatCurrency(buchung.betrag_brutto_cent)}
                                    </div>
                                    ${buchung.beleg ? `
                                    <button onclick="openBuchungBeleg(this)" data-beleg="${buchung.beleg.data}" data-beleg-name="${buchung.beleg.name}" class="btn btn-sm bg-gray-200 text-gray-700 hover:bg-gray-300 mt-2 mr-2" title="Beleg ansehen">                                        <i data-lucide="file-text" class="h-3 w-3"></i>
                                    </button>
                                    ` : ''}
                                    <button onclick="editBuchung('${buchung.id}')" class="btn btn-sm bg-blue-600 text-white hover:bg-blue-700 mt-2 mr-2" title="Buchung bearbeiten">
                                        <i data-lucide="pencil" class="h-3 w-3"></i>
                                        Bearbeiten
                                    </button>
                                    <button onclick="deleteBuchung('${buchung.id}')" class="btn btn-sm bg-red-600 text-white hover:bg-red-700 mt-2" title="Buchung löschen">
                                        <i data-lucide="trash-2" class="h-3 w-3"></i>
                                        Löschen
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Details Section -->
                            <div class="border-t pt-3 mt-3">
                                <div class="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <span class="text-gray-600">Netto:</span>
                                        <span style="float: right;" class="font-medium">${this.formatCurrency(buchung.betrag_netto_cent)}</span>
                                    </div>
                                    <div>
                                        <span class="text-gray-600">MwSt (${buchung.mwst_satz}%):</span>
                                        <span style="float: right;" class="font-medium">${this.formatCurrency(buchung.mwst_betrag_cent)}</span>
                                    </div>
                                    <div>
                                        <span class="text-gray-600">Brutto:</span>
                                        <span style="float: right;" class="font-semibold ${typeColor}">${this.formatCurrency(buchung.betrag_brutto_cent)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                container.innerHTML = html;
                
                // Update count
                const countElement = document.getElementById('buchungen-count');
                if (countElement) {
                    countElement.textContent = buchungen.length;
                }
            }
            
            getAccountName(accountNumber) {
                const accounts = {
                    '3400': 'Nachlässe auf Wareneinkäufe',
                    '4280': 'Sonstige betriebliche Erträge',
                    '4300': 'Erträge aus Anlagevermögen',
                    '4400': 'Erträge aus anderen Wertpapieren',
                    '6000': 'Aufwendungen für Roh-, Hilfs- und Betriebsstoffe',
                    '6100': 'Aufwendungen für bezogene Leistungen',
                    '6200': 'Löhne und Gehälter',
                    '6300': 'Gesetzliche soziale Aufwendungen',
                    '6400': 'Abschreibungen',
                    '6500': 'Reparaturen und Instandhaltung',
                    '6600': 'Mieten und Pachten',
                    '6700': 'Bürobedarf, Post- und Telekommunikation',
                    '1000': 'Kasse',
                    '1200': 'Bank',
                    '1400': 'Forderungen aus Lieferungen',
                    '1600': 'Vorräte'
                };
                return accounts[accountNumber] || 'Unbekanntes Konto';
            }

            // Waren Methods
            async loadWaren() {
                try {
                    const waren = await this.db.getAll('waren');
                    waren.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    this.displayWaren(waren);
                } catch (error) {
                    console.error('Error loading waren:', error);
                }
            }

            displayWaren(waren) {
                const container = document.getElementById('products-list');
                if (!container) {
                    console.error('Products list container not found');
                    return;
                }

                if (waren.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-8 text-gray-500">
                            <div class="text-4xl mb-4">📦</div>
                            <p>Noch keine Produkte im Lager.</p>
                            <p class="text-sm">Legen Sie Ihr erstes Produkt an.</p>
                        </div>
                    `;
                    return;
                }

                let html = '';
                waren.forEach(ware => {
                    const bestand = ware.bestand || 0;
                    const mindestbestand = ware.mindestbestand || 0;
                    const lowStock = bestand <= mindestbestand;
                    const stockClass = lowStock ? 'text-red-600' : 'text-green-600';
                    const stockIcon = lowStock ? 'alert-triangle' : 'check-circle';

                    html += `
                        <div class="card p-6 hover:shadow-lg transition-shadow ware-card">
                            <div class="flex justify-between items-start mb-4">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-2">
                                        <h3 class="text-lg font-semibold text-gray-900">${ware.name}</h3>
                                        <span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                            ${ware.kategorie || 'Allgemein'}
                                        </span>
                                    </div>
                                    ${ware.artikelnummer ? `<p class="text-sm text-gray-500 mb-1">Art.-Nr.: ${ware.artikelnummer}</p>` : ''}
                                    ${ware.beschreibung ? `<p class="text-sm text-gray-600 mb-2">${ware.beschreibung}</p>` : ''}
                                </div>
                                <div class="text-right">
                                    <div class="flex items-center gap-1 ${stockClass} mb-1">
                                        <i data-lucide="${stockIcon}" class="h-4 w-4"></i>
                                        <span class="text-xl font-bold">${bestand} Stk.</span>
                                    </div>
                                    <p class="text-xs text-gray-500">Min: ${mindestbestand} Stk.</p>
                                </div>
                            </div>
                            
                            <!-- Details Grid -->
                            <div class="grid grid-cols-2 md:grid-cols-2 gap-4 text-sm mb-4">
                                <div>
                                    <span class="text-gray-600">Ø Preis/Stk:</span>
                                    <div class="font-semibold text-green-600">${this.calculateAveragePrice(ware)}</div>
                                </div>
                                <div>
                                    <span class="text-gray-600">Lagerwert:</span>
                                    <div class="font-semibold text-blue-600">${
                                        (() => {
                                            const stock = ware.bestand || 0;
                                            const avg = Number.isFinite(ware.avg_price_cent) ? ware.avg_price_cent
                                                       : (Number.isFinite(ware.preis_brutto_cent) ? ware.preis_brutto_cent
                                                       : (ware.preis_netto_cent || 0));
                                            return this.formatCurrency(stock * avg);
                                        })()
                                    }</div>
                                </div>
                            </div>

                            ${ware.varianten && ware.varianten.length ? `
                            <details class="mt-2">
                                <summary class="cursor-pointer text-sm text-gray-600">Varianten (${ware.varianten.length})</summary>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    ${ware.varianten.map(v => {
                                        const low = (v.stock || 0) <= (ware.mindestbestand || 0);
                                        return `<span class='px-2 py-1 text-xs rounded-full ${low ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}'>${v.name}: ${v.stock || 0} Stk.</span>`;
                                    }).join('')}
                                </div>
                            </details>
                            ` : ''}

                            <!-- Action Buttons -->
                            <div class="flex gap-2 pt-4 border-t border-gray-100">
                                <button onclick="editProduct('${ware.id}')" class="btn btn-sm bg-blue-600 text-white hover:bg-blue-700">
                                    <i data-lucide="edit" class="h-4 w-4"></i>
                                    Bearbeiten
                                </button>
                                <button onclick="openStockAdjustmentModal('${ware.id}', 'increase')" class="btn btn-sm bg-green-600 text-white hover:bg-green-700">
                                    <i data-lucide="plus" class="h-4 w-4"></i>
                                    + Bestand
                                </button>
                                <button onclick="openStockAdjustmentModal('${ware.id}', 'decrease')" class="btn btn-sm bg-orange-600 text-white hover:bg-orange-700">
                                    <i data-lucide="minus" class="h-4 w-4"></i>
                                    - Bestand
                                </button>
                                <button onclick="deleteProduct('${ware.id}')" class="btn btn-sm bg-red-600 text-white hover:bg-red-700">
                                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                                    Löschen
                                </button>
                            </div>
                        </div>
                    `;
                });

                container.innerHTML = html;
                
                container.querySelectorAll('.ware-card').forEach(card => {
                    card.addEventListener('click', e => {
                        if (e.target.closest('button')) return;
                        const details = card.querySelector('details');
                        if (details) details.open = !details.open;
                    });
                });

                // Initialize icons
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }

            // Bewegungen Methods
            async loadBewegungen() {
                try {
                    const bewegungen = await this.db.getAll('lagerbewegungen');
                    this.displayBewegungen(bewegungen);
                    await this.loadProductFilters();
                } catch (error) {
                    console.error('Error loading bewegungen:', error);
                }
            }

            displayBewegungen(bewegungen) {
                const container = document.getElementById('bewegungen-list');
                if (!container) return;

                // Update count
                const countElement = document.getElementById('bewegungen-count');
                if (countElement) {
                    countElement.textContent = bewegungen.length;
                }

                if (bewegungen.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-12">
                            <div class="text-4xl mb-4">🚚</div>
                            <p class="text-gray-500">Noch keine Lagerbewegungen vorhanden.</p>
                            <p class="text-sm text-gray-400 mt-2">Verwenden Sie die Schaltflächen oben, um Wareneingänge oder -ausgänge zu erfassen.</p>
                        </div>
                    `;
                    return;
                }

                let html = '';
                bewegungen.forEach(bewegung => {
                    // FIX: Support both 'type' and 'typ' property names
                    const movementType = bewegung.type || bewegung.typ;
                    const typeInfo = this.getMovementTypeInfo(movementType);
                    const productName = bewegung.productName || bewegung.produktName || 'Unbekanntes Produkt';
                    const date = new Date(bewegung.timestamp).toLocaleDateString('de-DE');
                    const time = new Date(bewegung.timestamp).toLocaleTimeString('de-DE');
                    
                    html += `
                        <div class="card p-4 hover:shadow-lg transition-shadow border-l-4 ${typeInfo.borderColor}">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-2">
                                        <i data-lucide="${typeInfo.icon}" class="h-4 w-4 ${typeInfo.color}"></i>
                                        <h4 class="font-semibold text-gray-900">${productName}</h4>
                                        <span class="px-2 py-1 text-xs rounded-full ${typeInfo.bgColor} ${typeInfo.textColor}">
                                            ${typeInfo.label}
                                        </span>
                                    </div>
                                    <div class="text-sm text-gray-500 space-y-1">
                                        <p><i data-lucide="calendar" class="h-3 w-3 inline mr-1"></i>${date} um ${time}</p>
                                        ${(bewegung.userKuerzel || bewegung.userName) ? `<p><i data-lucide="user" class="h-3 w-3 inline mr-1"></i>${bewegung.userKuerzel || bewegung.userName}</p>` : ''}
                                        <p><i data-lucide="package" class="h-3 w-3 inline mr-1"></i>Menge: <strong>${bewegung.quantity || bewegung.menge}</strong></p>
                                        ${(bewegung.supplier || bewegung.lieferant) ? `<p><i data-lucide="building" class="h-3 w-3 inline mr-1"></i>Lieferant: ${bewegung.supplier || bewegung.lieferant}</p>` : ''}
                                        ${(bewegung.customer || bewegung.kunde) ? `<p><i data-lucide="user" class="h-3 w-3 inline mr-1"></i>Kunde: ${bewegung.customer || bewegung.kunde}</p>` : ''}
                                        ${bewegung.reference ? `<p><i data-lucide="file-text" class="h-3 w-3 inline mr-1"></i>Referenz: ${bewegung.reference}</p>` : ''}
                                        ${bewegung.grund ? `<p><i data-lucide="info" class="h-3 w-3 inline mr-1"></i>Grund: ${bewegung.grund}</p>` : ''}
                                        ${(bewegung.reason && bewegung.reason !== 'verkauf') ? `<p><i data-lucide="info" class="h-3 w-3 inline mr-1"></i>Grund: ${this.getReasonText(bewegung.reason)}</p>` : ''}
                                        ${(bewegung.notes || bewegung.notiz) ? `<p><i data-lucide="message-circle" class="h-3 w-3 inline mr-1"></i>Notiz: ${bewegung.notes || bewegung.notiz}</p>` : ''}
                                        ${bewegung.alterBestand !== undefined ? `<p><i data-lucide="trending-up" class="h-3 w-3 inline mr-1"></i>Bestand: ${bewegung.alterBestand} → ${bewegung.neuerBestand}</p>` : ''}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="font-bold text-lg ${typeInfo.amountColor}">
                                        ${(movementType === 'eingang' || movementType === 'zugang') ? '+' : '-'}${bewegung.quantity || bewegung.menge}
                                    </div>
                                    ${(bewegung.unitPrice || bewegung.preis_pro_stueck_cent) ? `<div class="text-xs text-gray-500">${bewegung.unitPrice ? bewegung.unitPrice.toFixed(2) : ((bewegung.preis_pro_stueck_cent || 0) / 100).toFixed(2)}€/Stk</div>` : ''}
                                    ${(bewegung.totalValue || bewegung.gesamtwert_cent) ? `<div class="text-sm font-medium mt-1">${bewegung.totalValue ? bewegung.totalValue.toFixed(2) : ((bewegung.gesamtwert_cent || 0) / 100).toFixed(2)}€</div>` : ''}
                                </div>
                            </div>
                            
                            ${bewegung.bookingCreated ? `
                                <div class="mt-2 flex items-center gap-2 text-xs text-green-600">
                                    <i data-lucide="check-circle" class="h-3 w-3"></i>
                                    <span>Automatische Buchung erstellt</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });

                container.innerHTML = html;
                
                // Initialize icons
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }

            getMovementTypeInfo(type) {
                const types = {
                    'eingang': {
                        label: 'Wareneingang',
                        icon: 'package-plus',
                        color: 'text-green-600',
                        bgColor: 'bg-green-100',
                        textColor: 'text-green-800',
                        borderColor: 'border-green-500',
                        amountColor: 'text-green-600'
                    },
                    'zugang': {  // Add support for new 'zugang' type
                        label: 'Bestandserhöhung',
                        icon: 'plus-circle',
                        color: 'text-green-600',
                        bgColor: 'bg-green-100',
                        textColor: 'text-green-800',
                        borderColor: 'border-green-500',
                        amountColor: 'text-green-600'
                    },
                    'ausgang': {
                        label: 'Warenausgang',
                        icon: 'package-minus',
                        color: 'text-red-600',
                        bgColor: 'bg-red-100',
                        textColor: 'text-red-800',
                        borderColor: 'border-red-500',
                        amountColor: 'text-red-600'
                    },
                    'abgang': {  // Add support for new 'abgang' type
                        label: 'Bestandsreduzierung',
                        icon: 'minus-circle',
                        color: 'text-orange-600',
                        bgColor: 'bg-orange-100',
                        textColor: 'text-orange-800',
                        borderColor: 'border-orange-500',
                        amountColor: 'text-orange-600'
                    },
                    'anpassung': {
                        label: 'Bestandsanpassung',
                        icon: 'edit',
                        color: 'text-blue-600',
                        bgColor: 'bg-blue-100',
                        textColor: 'text-blue-800',
                        borderColor: 'border-blue-500',
                        amountColor: 'text-blue-600'
                    }
                };
                return types[type] || types['anpassung'];
            }

            getReasonText(reason) {
                const reasons = {
                    'verkauf': 'Verkauf',
                    'retoure': 'Retoure/Rückgabe',
                    'defekt': 'Defekt/Schwund',
                    'probe': 'Muster/Probe',
                    'intern': 'Interne Verwendung',
                    'sonstiges': 'Sonstiges'
                };
                return reasons[reason] || reason;
            }
            // Calculate average price per unit (Gesamtwert / Menge)
            calculateAveragePrice(product) {
                const stock = product.bestand || 0;
                if (stock <= 0) return '0,00 €';
                const avg = Number.isFinite(product.avg_price_cent) ? product.avg_price_cent
                           : (Number.isFinite(product.preis_brutto_cent) ? product.preis_brutto_cent
                           : (product.preis_netto_cent || 0));
                return this.formatCurrency(avg);
            }

            async loadProductFilters() {
                try {
                    const waren = await this.db.getAll('waren');
                    const productSelects = [
                        document.getElementById('bewegung-product-filter'),
                        document.getElementById('wareneingang-product'),
                        document.getElementById('warenausgang-product')
                    ];

                    productSelects.forEach(select => {
                        if (select) {
                            // Keep existing options (first option)
                            const firstOption = select.querySelector('option');
                            select.innerHTML = firstOption ? firstOption.outerHTML : '<option value="">Alle Produkte</option>';
                            
                            waren.forEach(ware => {
                                const option = document.createElement('option');
                                option.value = ware.id;
                                option.textContent = `${ware.name} (${ware.artikelnummer || 'N/A'})`;
                                select.appendChild(option);
                            });
                        }
                    });
                } catch (error) {
                    console.error('Error loading product filters:', error);
                }
            }

                       // Recent Activities
            async loadRecentActivities() {
                try {
                    const buchungen = await this.db.getAll('buchungen');
                    const container = document.getElementById('recent-activities');
                    if (!container) return;
                    
                    const recent = buchungen
                        .sort((a, b) => new Date(b.datum) - new Date(a.datum))
                        .slice(0, 5);
                        
                    if (recent.length === 0) {
                        container.innerHTML = '<p class="text-gray-500 text-sm">Keine Aktivitäten vorhanden</p>';
                        return;
                    }
                    
                    let html = '';
                    recent.forEach(buchung => {
                        const icon = buchung.typ === 'einnahme' ? 'plus-circle' : 'minus-circle';
                        const iconClass = buchung.typ === 'einnahme' ? 'text-green-600' : 'text-red-600';
                        
                        html += `
                            <div class="flex items-center space-x-3 p-2 rounded" style="transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='transparent'">
                                <i data-lucide="${icon}" class="h-4 w-4 ${iconClass}"></i>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-gray-900">${buchung.beschreibung}</p>
                                    <p class="text-xs text-gray-500">${new Date(buchung.datum).toLocaleDateString('de-DE')}</p>
                                </div>
                                <span class="text-sm font-medium ${iconClass}">${this.formatCurrency(buchung.betrag_brutto_cent)}</span>
                            </div>
                        `;
                    });
                    
                    container.innerHTML = html;
                    lucide.createIcons();
                } catch (error) {
                    console.error('Error loading recent activities:', error);
                }
            }

            // Utility Methods
            formatCurrency(centAmount) {
                if (centAmount === null || centAmount === undefined) return '0,00 €';
                const euros = centAmount / 100;
                return new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR'
                }).format(euros);
            }

            euroToCent(euroAmount) {
                return Math.round(parseFloat(euroAmount || 0) * 100);
            }

            centToEuro(centAmount) {
                return (centAmount / 100).toFixed(2);
            }

            calculateNettoFromBrutto(bruttoCent, mwstSatz) {
                if (mwstSatz === 0) {
                    return { netto: bruttoCent, mwst: 0 };
                }
                
                const divisor = 1 + (mwstSatz / 100);
                const netto = Math.round(bruttoCent / divisor);
                const mwst = bruttoCent - netto;
                
                return { netto, mwst };
            }

            updateElement(id, value) {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                }
            }
        }

        // =====================================
        // DRAG & DROP FUNCTIONALITY
        // =====================================

        function setupDragAndDrop() {
            const dropZone = document.getElementById('drop-zone');
            const body = document.body;

            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                body.addEventListener(eventName, preventDefaults, false);
                document.documentElement.addEventListener(eventName, preventDefaults, false);
            });

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }

            // Highlight drop area when item is dragged over it
            ['dragenter', 'dragover'].forEach(eventName => {
                body.addEventListener(eventName, highlight, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                body.addEventListener(eventName, unhighlight, false);
            });

            function highlight(e) {
                if (dropZone) {
                    dropZone.classList.remove('hidden');
                    dropZone.classList.add('border-blue-500', 'bg-blue-100');
                }
            }

            function unhighlight(e) {
                if (dropZone) {
                    setTimeout(() => {
                        dropZone.classList.add('hidden');
                        dropZone.classList.remove('border-blue-500', 'bg-blue-100');
                    }, 100);
                }
            }

            // Handle dropped files
            body.addEventListener('drop', handleDrop, false);

            function handleDrop(e) {
                const dt = e.dataTransfer;
                const files = dt.files;

                handleDroppedFiles(files);
            }
        }

        async function handleDroppedFiles(files) {
            const savedPath = localStorage.getItem('optispar-data-path') || 'Optispar-Daten';
            
            [...files].forEach(file => {
                if (file.type === 'application/json' || file.name.endsWith('.json')) {
                    const reader = new FileReader();
                    
                    reader.onload = async function(e) {
                        try {
                            const data = JSON.parse(e.target.result);
                            
                            // Check if it's an Optispar file
                            if (data.konten || data.buchungen || data.waren || data.exportInfo) {
                                await importOptisparData(data);
                                showNotification(`✅ Datei "${file.name}" erfolgreich importiert!`, 'success');
                                
                                // Show path context
                                setTimeout(() => {
                                    showNotification(`📁 Daten aus ${savedPath} geladen`, 'info');
                                }, 2000);
                            } else {
                                showNotification('❌ Datei ist keine gültige Optispar-Datei', 'error');
                            }
                        } catch (error) {
                            console.error('Import error:', error);
                            showNotification('❌ Fehler beim Importieren der Datei', 'error');
                        }
                    };
                    
                    reader.readAsText(file);
                } else {
                    showNotification('❌ Nur JSON-Dateien werden unterstützt', 'error');
                }
            });
        }

        // Improved import function
        async function importOptisparData(data) {
            try {
                // Validate data structure
                if (!data || typeof data !== 'object') {
                    throw new Error('Ungültige Datenstruktur');
                }

                // Clear existing data first (optional - could be made configurable)
                const confirmClear = confirm('Möchten Sie die vorhandenen Daten überschreiben? (Empfohlen: Ja für vollständigen Import)');
                
                if (confirmClear) {
                    const stores = ['konten', 'buchungen', 'waren', 'lagerbewegungen'];
                    for (const store of stores) {
                        // Clear existing data
                        const transaction = app.db.db.transaction([store], 'readwrite');
                        const objectStore = transaction.objectStore(store);
                        await new Promise((resolve, reject) => {
                            const clearRequest = objectStore.clear();
                            clearRequest.onsuccess = () => resolve();
                            clearRequest.onerror = () => reject(clearRequest.error);
                        });
                    }
                    await modernBestellungenDB.clearAll();
                }

                // Import new data
                if (data.konten && Array.isArray(data.konten)) {
                    for (const konto of data.konten) {
                        await app.db.add('konten', konto);
                    }
                }

                if (data.buchungen && Array.isArray(data.buchungen)) {
                    for (const buchung of data.buchungen) {
                        await app.db.add('buchungen', buchung);
                    }
                }

                if (data.waren && Array.isArray(data.waren)) {
                    for (const ware of data.waren) {
                        await app.db.add('waren', ware);
                    }
                }

                if (data.lagerbewegungen && Array.isArray(data.lagerbewegungen)) {
                    for (const bewegung of data.lagerbewegungen) {
                        await app.db.add('lagerbewegungen', bewegung);
                    }
                }
                if (data.bestellungen && Array.isArray(data.bestellungen)) {
                    for (const bestellung of data.bestellungen) {
                        await modernBestellungenDB.add(bestellung);
                    }
                }

                // Refresh all data displays
                await app.loadAll();
                await updateReportStats();
                await loadModernBestellungen();

            } catch (error) {
                console.error('Import error:', error);
                throw error;
            }
        }

        // =====================================
        // GLOBAL VARIABLES
        // =====================================
        
        let app;

        // Fixed switchTab function with proper app initialization check
        function switchTab(tabName) {
            try {
                console.log(`Switching to tab: ${tabName}`);
                
                // Special handling for lager tab
                if (tabName === 'lager') {
                    forceShowLager();
                    return;
                }
                
                // Hide all tab contents
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                    content.style.display = 'none';
                });
                
                // Remove active class from all tab buttons
                document.querySelectorAll('.tab-button').forEach(button => {
                    button.classList.remove('active');
                });
                
                // Show selected tab content
                const contentElement = document.getElementById(`content-${tabName}`);
                if (contentElement) {
                    contentElement.classList.add('active');
                    contentElement.style.display = 'block';
                    console.log(`Activated content: content-${tabName}`);
                } else {
                    console.error(`Content element not found: content-${tabName}`);
                }
                
                // Activate tab button
                const tabButton = document.getElementById(`tab-${tabName}`);
                if (tabButton) {
                    tabButton.classList.add('active');
                    console.log(`Activated tab button: tab-${tabName}`);
                } else {
                    console.error(`Tab button not found: tab-${tabName}`);
                }
                
                // Reinitialize icons for the active tab
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
                
                // Load data for specific tabs if app is ready
                if (app && app.loadWaren && tabName === 'lager') {
                    app.loadWaren().catch(console.error);
                }
                
                if (tabName === 'bestellungen') {
                    // Load modern bestellungen when switching to the tab
                    console.log('🛒 Switching to modern bestellungen tab');
                    loadModernBestellungen().catch(console.error);
                }
                
                console.log(`Tab switch to ${tabName} completed`);
            } catch (error) {
                console.error('Error in switchTab:', error);
            }
        }

        // =====================================
        // MODAL FUNCTIONS
        // =====================================

        // Buchungskonten dynamisch laden
        async function loadBookingAccounts() {
            try {
                const konten = await app.db.getAll('konten');
                
                // Für Buchungsmodal
                const bookingAccountInput = document.getElementById('booking-konto');
                if (bookingAccountInput && konten.length > 0) {
                    populateAccountDatalist(bookingAccountInput, konten);
                }
                
                // Für Buchungen-Filter
                const filterAccountSelect = document.getElementById('buchungen-konto-filter');
                if (filterAccountSelect && konten.length > 0) {
                    populateAccountSelect(filterAccountSelect, konten, false);
                }
                
            } catch (error) {
                console.error('Error loading booking accounts:', error);
            }
        }

        function populateAccountDatalist(inputElement, konten) {
            const datalist = document.getElementById('booking-konto-options');
            if (!datalist) return;

            datalist.innerHTML = '';
            
            const bookingType = app && app.currentBookingType;
            let filtered = konten;
            if (bookingType === 'einnahme') {
                filtered = konten.filter(k => k.typ === 'Ertrag');
            } else if (bookingType === 'ausgabe') {
                filtered = konten.filter(k => k.typ === 'Aufwand');
            }

            filtered.sort((a, b) => a.nummer - b.nummer).forEach(konto => {
                const option = document.createElement('option');
                option.value = `${konto.nummer} - ${konto.name}`;
                datalist.appendChild(option);
            });
        }

        function populateAccountSelect(selectElement, konten, isBookingModal = false) {
            let filtered = konten;
            if (isBookingModal) {
                const bookingType = app && app.currentBookingType;
                if (bookingType === 'einnahme') {
                    filtered = konten.filter(k => k.typ === 'Ertrag');
                } else if (bookingType === 'ausgabe') {
                    filtered = konten.filter(k => k.typ === 'Aufwand');
                }
            }

            // Gruppiere Konten nach Typ
            const ertragskonten = filtered.filter(k => k.typ === 'Ertrag').sort((a, b) => a.nummer - b.nummer);
            const aufwandskonten = filtered.filter(k => k.typ === 'Aufwand').sort((a, b) => a.nummer - b.nummer);
            const aktivkonten = filtered.filter(k => k.typ === 'Aktiv').sort((a, b) => a.nummer - b.nummer);
            const passivkonten = filtered.filter(k => k.typ === 'Passiv').sort((a, b) => a.nummer - b.nummer);
            const steuerkonten = filtered.filter(k => k.typ === 'Steuer').sort((a, b) => a.nummer - b.nummer);
            
            // Bestehende Optionen löschen (außer der ersten)
            const firstOption = selectElement.firstElementChild;
            selectElement.innerHTML = '';
            selectElement.appendChild(firstOption);
            
            // Einnahmekonten hinzufügen
            if (ertragskonten.length > 0) {
                const ertragGroup = document.createElement('optgroup');
                ertragGroup.label = 'Einnahmekonten';
                ertragskonten.forEach(konto => {
                    const option = document.createElement('option');
                    option.value = konto.nummer;
                    option.textContent = `${konto.nummer} - ${konto.name}`;
                    ertragGroup.appendChild(option);
                });
                selectElement.appendChild(ertragGroup);
            }
            
            // Ausgabenkonten hinzufügen
            if (aufwandskonten.length > 0) {
                const aufwandGroup = document.createElement('optgroup');
                aufwandGroup.label = 'Ausgabenkonten';
                aufwandskonten.forEach(konto => {
                    const option = document.createElement('option');
                    option.value = konto.nummer;
                    option.textContent = `${konto.nummer} - ${konto.name}`;
                    aufwandGroup.appendChild(option);
                });
                selectElement.appendChild(aufwandGroup);
            }
            
            // Aktivkonten (Bilanz) hinzufügen
            if (aktivkonten.length > 0) {
                const aktivGroup = document.createElement('optgroup');
                aktivGroup.label = 'Aktivkonten (Bilanz)';
                aktivkonten.forEach(konto => {
                    const option = document.createElement('option');
                    option.value = konto.nummer;
                    option.textContent = `${konto.nummer} - ${konto.name}`;
                    aktivGroup.appendChild(option);
                });
                selectElement.appendChild(aktivGroup);
            }
            
            // Passivkonten (Bilanz) hinzufügen
            if (passivkonten.length > 0) {
                const passivGroup = document.createElement('optgroup');
                passivGroup.label = 'Passivkonten (Bilanz)';
                passivkonten.forEach(konto => {
                    const option = document.createElement('option');
                    option.value = konto.nummer;
                    option.textContent = `${konto.nummer} - ${konto.name}`;
                    passivGroup.appendChild(option);
                });
                selectElement.appendChild(passivGroup);
            }
            
            // Steuerkonten hinzufügen
            if (steuerkonten.length > 0) {
                const steuerGroup = document.createElement('optgroup');
                steuerGroup.label = 'Steuerkonten';
                steuerkonten.forEach(konto => {
                    const option = document.createElement('option');
                    option.value = konto.nummer;
                    option.textContent = `${konto.nummer} - ${konto.name}`;
                    steuerGroup.appendChild(option);
                });
                selectElement.appendChild(steuerGroup);
            }
        }

        // Booking Modal Management
        // Enhanced booking modal management with proper app initialization check
        function openBookingModal(type = 'einnahme') {
            // Critical fix: Check if app is initialized before using it
            if (!app) {
                console.warn('App not initialized yet, please wait...');
                showNotification('System wird noch geladen, bitte warten...', 'warning');
                return;
            }
            
            try {
                app.currentBookingType = type;
                const modal = document.getElementById('booking-modal');
                const title = document.getElementById('modal-title');
                const subtitle = document.getElementById('modal-subtitle');
                const submitBtn = document.getElementById('booking-submit-btn');
                
                console.log(`Opening booking modal for type: ${type}`);
            
            // Reset and prepare icon container to avoid duplicated icons
            const modalIcon = document.getElementById('modal-icon');
            let icon = null;
            if (modalIcon) {
                modalIcon.innerHTML = '';
                icon = document.createElement('i');
                modalIcon.appendChild(icon);
            }
            
            // Reset form
            document.getElementById('booking-form').reset();
            document.getElementById('invoice-validation').classList.add('hidden');

            // Set current date
            document.getElementById('booking-datum').value = new Date().toISOString().split('T')[0];
            
            // Configure modal based on type
            if (type === 'einnahme') {
                title.textContent = 'Neue Einnahme';
                subtitle.textContent = 'Professionelle Einnahme-Buchung erfassen';
                if (icon) {
                    icon.setAttribute('data-lucide', 'trending-up');
                    icon.className = 'h-6 w-6 text-green-600';
                }
                document.getElementById('modal-icon').className = 'p-2 rounded-full bg-green-100';
                submitBtn.className = 'btn btn-green';
                submitBtn.innerHTML = '<i data-lucide="save" class="h-4 w-4"></i> Einnahme speichern';
            } else {
                title.textContent = 'Neue Ausgabe';
                subtitle.textContent = 'Professionelle Ausgabe-Buchung erfassen';
                if (icon) {
                    icon.setAttribute('data-lucide', 'trending-down');
                    icon.className = 'h-6 w-6 text-red-600';
                }
                document.getElementById('modal-icon').className = 'p-2 rounded-full bg-red-100';
                submitBtn.className = 'btn btn-red';
                submitBtn.innerHTML = '<i data-lucide="save" class="h-4 w-4"></i> Ausgabe speichern';
            }
            
            // Load accounts
            loadBookingAccounts();
            
            // Show modal
            modal.classList.add('active');
            
            // Refresh lucide icons
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
            
            } catch (error) {
                console.error('Error opening booking modal:', error);
                showNotification('Fehler beim Öffnen des Buchungsformulars', 'error');
            }
        }

        function closeBookingModal() {
            const modal = document.getElementById('booking-modal');
            modal.classList.remove('active');
            document.getElementById('booking-form').reset();
            document.getElementById('invoice-validation').classList.add('hidden');
            if (app) {
                app.editingBuchungId = null;
            }
        }

        let currentVariants = [];

        function openProductModal(productId = null) {
            if (!app) {
                console.warn('App not initialized yet, please wait...');
                showNotification('System wird noch geladen, bitte warten...', 'warning');
                return;
            }

            const modal = document.getElementById('product-modal');
            const title = document.getElementById('product-modal-title');
            const submitBtn = document.getElementById('product-submit-btn');
            
            if (productId) {
                // Edit mode
                app.isEditingProduct = true;
                title.textContent = 'Produkt bearbeiten';
                submitBtn.textContent = 'Aktualisieren';
                
                // Load existing product data
                app.db.get('waren', productId).then(product => {
                    if (!product) {
                        showNotification('Produkt nicht gefunden', 'error');
                        return;
                    }
                    
                    app.currentProduct = product;
                    
                    // Fill form fields
                    document.getElementById('product-name').value = product.name || '';
                    document.getElementById('product-artikelnummer').value = product.artikelnummer || '';
                    document.getElementById('product-beschreibung').value = product.beschreibung || '';
                    document.getElementById('product-preis-netto').value = app.centToEuro(product.preis_netto_cent || 0);
                    document.getElementById('product-mwst-satz').value = product.mwst_satz || 19;
                    document.getElementById('product-kategorie').value = product.kategorie || '';
                    document.getElementById('product-bestand').value = product.bestand || 0;
                    document.getElementById('product-mindestbestand').value = product.mindestbestand || 5;
                    document.getElementById('product-lieferant').value = product.lieferant || '';
                    currentVariants = (product.varianten || []).map(v =>
                        typeof v === 'string' ? { name: v, stock: 0 } : v
                    );
                    renderVariantList();
                    calculateProductPrice();
                }).catch(error => {
                    console.error('Error loading product:', error);
                    showNotification('Fehler beim Laden des Produkts', 'error');
                });
            } else {
                // Create mode
                app.isEditingProduct = false;
                app.currentProduct = null;
                title.textContent = 'Neues Produkt anlegen';
                submitBtn.textContent = 'Speichern';
                document.getElementById('product-form').reset();
                document.getElementById('product-bestand').value = '0';
                currentVariants = [];
                renderVariantList();
                document.getElementById('product-mindestbestand').value = '5';
                document.getElementById('product-mwst-satz').value = '19';
                calculateProductPrice();
            }
            
            modal.classList.add('active');
            const firstField = document.getElementById('product-name');
            if (firstField) firstField.focus();
        }
        function addVariant() {
            const nameInput = document.getElementById('product-variant-name');
            const stockInput = document.getElementById('product-variant-stock');
            const name = nameInput.value.trim();
            const stock = parseInt(stockInput.value) || 0;
            if (name) {
                currentVariants.push({ name, stock });
                nameInput.value = '';
                stockInput.value = '';
                renderVariantList();
            }
        }

        function removeVariant(index) {
            currentVariants.splice(index, 1);
            renderVariantList();
        }

        function renderVariantList() {
            const list = document.getElementById('product-varianten-list');
            if (!list) return;
            list.innerHTML = currentVariants.map((v, i) => `
                <div class="flex items-center gap-2">
                    <span class="px-2 py-1 bg-gray-100 rounded text-sm">${v.name} – ${v.stock} Stk.</span>
                    <button type="button" class="text-red-500 hover:text-red-700 text-xs" onclick="removeVariant(${i})">&times;</button>
                </div>
            `).join('');
            const total = currentVariants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
            const stockInput = document.getElementById('product-bestand');
            if (stockInput) stockInput.value = total;
        }
        function closeProductModal() {
            const modal = document.getElementById('product-modal');
            modal.classList.remove('active');
            const form = document.getElementById('product-form');
            if (form) {
                form.reset();
                if (typeof calculateProductPrice === 'function') calculateProductPrice();
            }
            currentVariants = [];
            renderVariantList();
            app.isEditingProduct = false;
            app.currentProduct = null;
        }

        function openUserModal() {
            if (!isAdmin) {
                showNotification('Keine Berechtigung', 'error');
                return;
            }
            const modal = document.getElementById('user-modal');
            document.getElementById('user-form').reset();
            modal.classList.add('active');
        }

        function closeUserModal() {
            document.getElementById('user-modal').classList.remove('active');
        }

        async function handleUserSubmit(e) {
            e.preventDefault();
            if (!isAdmin) {
                showNotification('Keine Berechtigung', 'error');
                return;
            }
            const user = {
                name: document.getElementById('user-name').value,
                geburtsdatum: document.getElementById('user-geburtsdatum').value,
                kuerzel: document.getElementById('user-kuerzel').value,
                bereich: document.getElementById('user-bereich').value,
                email: document.getElementById('user-email').value,
                password: document.getElementById('user-password').value,
                role: document.getElementById('user-role').value
            };
            try {
                await app.db.add('users', user);
                closeUserModal();
                showNotification('Benutzer gespeichert', 'success');
            } catch (err) {
                console.error('Error saving user', err);
                showNotification('Fehler beim Speichern des Benutzers', 'error');
            }
        }

        async function openUserListModal() {
            if (!isAdmin) {
                showNotification('Keine Berechtigung', 'error');
                return;
            }
            const container = document.getElementById('user-list-container');
            container.innerHTML = '';
            const users = await app.db.getAll('users');
            users.forEach(u => {
                const row = document.createElement('div');
                row.className = 'flex justify-between items-center border p-2 rounded';
                row.innerHTML =
                    `<div><p class="font-medium">${u.name}</p><p class="text-sm text-gray-500">${u.email}</p></div>` +
                    `<div class="flex items-center space-x-2">` +
                    `<select class="form-input text-sm" onchange="changeUserRole('${u.id}', this.value)">` +
                    `<option value="user" ${u.role === 'user' ? 'selected' : ''}>Nutzer</option>` +
                    `<option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>` +
                    `</select>` +
                    `<button class="btn btn-sm btn-secondary" onclick="changeUserPassword('${u.id}')">Passwort ändern</button>` +
                    `<button class="btn btn-sm bg-red-600 text-white hover:bg-red-700" onclick="confirmDeleteUser('${u.id}')">Löschen</button>` +
                    `</div>`;
               container.appendChild(row);
            });
            document.getElementById('user-list-modal').classList.add('active');
        }

        function closeUserListModal() {
            document.getElementById('user-list-modal').classList.remove('active');
        }

        async function changeUserPassword(userId) {
            if (!isAdmin) {
                showNotification('Keine Berechtigung', 'error');
                return;
            }
            const newPass = prompt('Neues Passwort eingeben:');
            if (!newPass) return;
            try {
                const user = await app.db.get('users', userId);
                if (user) {
                    user.password = newPass;
                    await app.db.put('users', user);
                    showNotification('Passwort aktualisiert', 'success');
                    openUserListModal();
                }
            } catch (err) {
                console.error('Error updating password', err);
                showNotification('Fehler beim Aktualisieren des Passworts', 'error');
            }
        }

        async function changeUserRole(userId, newRole) {
            if (!isAdmin) {
                showNotification('Keine Berechtigung', 'error');
                return;
            }
            const confirmPass = prompt('Bitte Passwort zur Bestätigung eingeben:');
            if (!confirmPass) return;
            if (!app.currentUser || app.currentUser.password !== confirmPass) {
                showNotification('Passwort falsch', 'error');
                openUserListModal();
                return;
            }
            try {
                const user = await app.db.get('users', userId);
                if (user) {
                    user.role = newRole;
                    await app.db.put('users', user);
                    showNotification('Rolle aktualisiert', 'success');
                    if (app.currentUser.id === userId) {
                        app.currentUser.role = newRole;
                        isAdmin = newRole === 'admin';
                        saveSession();
                        toggleAdminFeatures();
                    }
                }
            } catch (err) {
                console.error('Error updating role', err);
                showNotification('Fehler beim Aktualisieren der Rolle', 'error');
            }
            if (isAdmin) {
                openUserListModal();
            } else {
                closeUserListModal();
            }
        }

        function confirmDeleteUser(userId) {
            if (!isAdmin) {
                showNotification('Keine Berechtigung', 'error');
                return;
            }
            openDeleteModal('Benutzer wirklich löschen?', async () => {
                try {
                    await app.db.delete('users', userId);
                    showNotification('Benutzer gelöscht', 'success');
                    openUserListModal();
                } catch (err) {
                    console.error('Error deleting user', err);
                    showNotification('Fehler beim Löschen des Benutzers', 'error');
                }
            });
        }

        function openSettingsModal() {
            document.getElementById('settings-old-password').value = '';
            document.getElementById('settings-password').value = '';
            document.getElementById('settings-confirm-password').value = '';
            document.getElementById('settings-timeout').value = autoLogoutMinutes;
            document.getElementById('settings-modal').classList.add('active');
        }

        function closeSettingsModal() {
            document.getElementById('settings-modal').classList.remove('active');
        }

          async function handleSettingsChange(e) {
            e.preventDefault();
            if (!app || !app.currentUser) {
                showNotification('Keine Benutzerinformation', 'error');
                return;
            }
            const oldPass = document.getElementById('settings-old-password').value.trim();
            const newPass = document.getElementById('settings-password').value.trim();
            const confirmPass = document.getElementById('settings-confirm-password').value.trim();
            const timeoutValue = parseInt(document.getElementById('settings-timeout').value, 10) || 30;
            autoLogoutMinutes = timeoutValue;
            setStoredTimeout(app.currentUser.email, autoLogoutMinutes);
            if (oldPass || newPass || confirmPass) {
                if (oldPass !== app.currentUser.password) {
                    showNotification('Altes Passwort ist falsch', 'error');
                    return;
                }
                if (!newPass || newPass !== confirmPass) {
                    showNotification('Neue Passwörter stimmen nicht überein', 'error');
                    return;
                }
                app.currentUser.password = newPass;
                try {
                    await app.db.put('users', app.currentUser);
                } catch (err) {
                    console.error('Error updating password', err);
                    showNotification('Fehler beim Aktualisieren des Passworts', 'error');
                    return;
                }
            }
            document.getElementById('settings-old-password').value = '';
            document.getElementById('settings-password').value = '';
            document.getElementById('settings-confirm-password').value = '';
            saveSession();
            closeSettingsModal();
            showNotification('Einstellungen gespeichert', 'success');
        }

        function openDeleteModal(message, callback) {
            document.getElementById('delete-message').textContent = message;
            document.getElementById('delete-modal').classList.add('active');
            app.deleteCallback = callback;
        }

        function closeDeleteModal() {
            document.getElementById('delete-modal').classList.remove('active');
            app.deleteCallback = null;
        }

        function confirmDelete() {
            if (app.deleteCallback) {
                app.deleteCallback();
            }
            closeDeleteModal();
        }

        // =====================================
        // CALCULATION FUNCTIONS
        // =====================================

        function calculateMwSt() {
            const brutto = parseFloat(document.getElementById('booking-betrag').value) || 0;
            const mwstSatz = parseInt(document.getElementById('booking-mwst-satz').value) || 0;
            
            const bruttoCent = app.euroToCent(brutto);
            const { netto, mwst } = app.calculateNettoFromBrutto(bruttoCent, mwstSatz);
            
            document.getElementById('booking-netto').textContent = app.formatCurrency(netto);
            document.getElementById('booking-mwst').textContent = app.formatCurrency(mwst);
            document.getElementById('booking-brutto').textContent = app.formatCurrency(bruttoCent);
        }

        function calculateProductPrice() {
            const netto = parseFloat(document.getElementById('product-preis-netto').value) || 0;
            const mwstSatz = parseInt(document.getElementById('product-mwst-satz').value) || 0;
            
            const brutto = netto * (1 + mwstSatz / 100);
            document.getElementById('product-preis-brutto').value = brutto.toFixed(2);
        }

        // =====================================
        // FORM HANDLERS
        // =====================================

        // =====================================
        // ENHANCED BOOKING FUNCTIONS
        // =====================================

        // Generate unique invoice number
        async function generateInvoiceNumber() {
            try {
                const nameField = document.getElementById('booking-kunde-name');
                const invoiceField = document.getElementById('booking-rechnung-nummer');
                
                if (!nameField.value) {
                    invoiceField.value = '';
                    return;
                }
                
                const customerName = nameField.value.trim();
                
                // Get all existing bookings to check for duplicate invoice numbers
                const existingBookings = await app.db.getAll('buchungen');
                
                // Find the highest invoice number for this customer
                let maxNumber = 0;
                const pattern = new RegExp(`^${customerName}\\s+R(\\d+)$`, 'i');
                
                existingBookings.forEach(booking => {
                    if (booking.rechnungsnummer) {
                        const match = booking.rechnungsnummer.match(pattern);
                        if (match) {
                            const num = parseInt(match[1]);
                            if (num > maxNumber) {
                                maxNumber = num;
                            }
                        }
                    }
                });
                
                // Generate next invoice number
                const nextNumber = (maxNumber + 1).toString().padStart(3, '0');
                const invoiceNumber = `${customerName} R${nextNumber}`;
                
                invoiceField.value = invoiceNumber;
                
                // Validate uniqueness
                await validateInvoiceNumber();
                
            } catch (error) {
                console.error('Error generating invoice number:', error);
                showNotification('Fehler beim Generieren der Rechnungsnummer', 'error');
            }
        }

        // Prefill description, account and category from last booking with same name
        async function prefillBookingFields() {
            try {
                const name = document.getElementById('booking-kunde-name').value.trim();
                if (!name) return;

                const bookings = await app.db.getAll('buchungen');
                const getTime = b => new Date(b.timestamp || b.datum || 0).getTime();
                const lastBooking = bookings
                    .filter(b => b.kundeName === name)
                    .sort((a, b) => getTime(b) - getTime(a))[0];

                if (lastBooking) {
                    document.getElementById('booking-beschreibung').value = lastBooking.beschreibung || '';
                    document.getElementById('booking-konto').value = lastBooking.konto || '';
                    document.getElementById('booking-kategorie').value = lastBooking.kategorie || '';
                }
            } catch (error) {
                console.error('Error pre-filling booking fields:', error);
            }
        }

        async function handleCustomerChange() {
            await generateInvoiceNumber();
            await prefillBookingFields();
        }

        // Validate invoice number uniqueness per customer ONLY
        async function validateInvoiceNumber() {
            try {
                const invoiceField = document.getElementById('booking-rechnung-nummer');
                const customerField = document.getElementById('booking-kunde-name');
                const validationDiv = document.getElementById('invoice-validation');
                const validationMessage = document.getElementById('validation-message');
                
                // If either field is empty, hide validation and allow
                if (!invoiceField.value || !customerField.value) {
                    validationDiv.classList.add('hidden');
                    return true;
                }
                
                const customerName = customerField.value.trim();
                const invoiceNumber = invoiceField.value.trim();
                
                console.log(`Validating: Customer "${customerName}" with Invoice "${invoiceNumber}"`);
                
                try {
                    const existingBookings = await app.db.getAll('buchungen');
                    console.log('Existing bookings for validation:', existingBookings);
                    
                    // Check ONLY for the SAME customer with SAME invoice number
                    const duplicateForThisCustomer = existingBookings.find(booking => 
                        booking.kundeName && 
                        booking.rechnungsnummer &&
                        booking.kundeName.toLowerCase().trim() === customerName.toLowerCase() &&
                        booking.rechnungsnummer.toLowerCase().trim() === invoiceNumber.toLowerCase()
                    );
                    
                    if (duplicateForThisCustomer) {
                        // DUPLICATE found for SAME customer
                        validationDiv.className = 'mb-4 p-3 rounded-lg bg-red-50 border border-red-200';
                        validationMessage.className = 'text-sm font-medium text-red-800';
                        validationMessage.textContent = `❌ Rechnungsnummer "${invoiceNumber}" existiert bereits für "${customerName}"!`;
                        validationDiv.classList.remove('hidden');
                        console.log('DUPLICATE FOUND for same customer');
                        return false;
                    } else {
                        // NO duplicate for this customer (other customers can have same number)
                        validationDiv.className = 'mb-4 p-3 rounded-lg bg-green-50 border border-green-200';
                        validationMessage.className = 'text-sm font-medium text-green-800';
                        validationMessage.textContent = `✅ Rechnungsnummer "${invoiceNumber}" ist verfügbar für "${customerName}"`;
                        validationDiv.classList.remove('hidden');
                        console.log('NO DUPLICATE - different customers can have same invoice number');
                        return true;
                    }
                } catch (dbError) {
                    // If IndexedDB fails, allow the booking (don't block user)
                    console.warn('IndexedDB error during validation, allowing booking:', dbError);
                    validationDiv.className = 'mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200';
                    validationMessage.className = 'text-sm font-medium text-yellow-800';
                    validationMessage.textContent = `⚠️ Validierung nicht möglich - Buchung wird zugelassen`;
                    validationDiv.classList.remove('hidden');
                    return true;
                }
                
            } catch (error) {
                console.error('Error validating invoice number:', error);
                return true; // Allow booking on error
            }
        }

        // Calculate net amount from gross amount and VAT
        function calculateNetAmount() {
            const bruttoField = document.getElementById('booking-betrag');
            const mwstField = document.getElementById('booking-mwst');
            const nettoField = document.getElementById('booking-netto');
            
            const brutto = parseFloat(bruttoField.value) || 0;
            const mwstRate = parseFloat(mwstField.value) || 0;
            
            if (brutto > 0) {
                const netto = brutto / (1 + mwstRate / 100);
                nettoField.value = netto.toFixed(2);
            } else {
                nettoField.value = '';
            }
        }

        // Enhanced booking submission
        async function handleBookingSubmit(event) {
            event.preventDefault();
            
            // Prevent double submission
            const submitButton = document.getElementById('booking-submit-btn');
            if (submitButton.disabled) {
                console.log('Submission already in progress, ignoring...');
                return;
            }
            
            // Disable submit button to prevent double submission
            submitButton.disabled = true;
            submitButton.innerHTML = '<i data-lucide="loader" class="h-4 w-4 animate-spin"></i> Speichern...';
            
            try {
                const modal = document.getElementById('booking-modal');
                const bookingType = app.currentBookingType || 'einnahme';
                const editingId = app.editingBuchungId;
                const existingBuchung = editingId ? await app.db.get('buchungen', editingId) : null;
                
                // Calculate net amount if not provided
                if (!document.getElementById('booking-netto').value) {
                    console.log('Calculating net amount...');
                    calculateNetAmount();
                }
                
                const nettoValue = parseFloat(document.getElementById('booking-netto').value || 0);
                const bruttoValue = parseFloat(document.getElementById('booking-betrag').value);
                
                console.log('Form values:', {
                    brutto: bruttoValue,
                    netto: nettoValue,
                    kunde: document.getElementById('booking-kunde-name').value,
                    beschreibung: document.getElementById('booking-beschreibung').value,
                    konto: document.getElementById('booking-konto').value
                });
                
                const formData = {
                    id: editingId || app.db.generateUUID(),
                    date: existingBuchung?.date || new Date().toISOString().split('T')[0],
                    kundeName: document.getElementById('booking-kunde-name').value,
                    rechnungsnummer: document.getElementById('booking-rechnung-nummer').value,
                    beschreibung: document.getElementById('booking-beschreibung').value,
                    datum: document.getElementById('booking-datum').value,
                    betrag: bruttoValue,
                    betrag_brutto_cent: Math.round(bruttoValue * 100),
                    betrag_netto_cent: Math.round(nettoValue * 100),
                    mwst_satz: parseFloat(document.getElementById('booking-mwst').value),
                    mwst_betrag_cent: Math.round((bruttoValue - nettoValue) * 100),
                    account: document.getElementById('booking-konto').value,
                    konto: parseInt(document.getElementById('booking-konto').value),
                    kategorie: document.getElementById('booking-kategorie').value,
                    notizen: document.getElementById('booking-notizen').value,
                    typ: bookingType,
                    timestamp: new Date().toISOString()
                };
                
                // Validate required fields
                if (!formData.kundeName || !formData.beschreibung || !formData.betrag || !formData.konto) {
                    showNotification('Bitte alle Pflichtfelder ausfüllen!', 'error');
                    console.error('Validation failed:', {
                        kunde: !!formData.kundeName,
                        beschreibung: !!formData.beschreibung,
                        betrag: !!formData.betrag,
                        konto: !!formData.konto
                    });
                    return;
                }
                
                // Final validation check
                if (isNaN(formData.betrag) || formData.betrag <= 0) {
                    showNotification('Bitte gültigen Betrag eingeben!', 'error');
                    return;
                }
                
                // Calculate missing net amount
                if (!formData.betrag_netto_cent || formData.betrag_netto_cent === 0) {
                    const mwstRate = formData.mwst_satz / 100;
                    const nettoCalculated = formData.betrag / (1 + mwstRate);
                    formData.betrag_netto_cent = Math.round(nettoCalculated * 100);
                    formData.mwst_betrag_cent = Math.round((formData.betrag - nettoCalculated) * 100);
                    console.log('Calculated missing values:', {
                        netto_cent: formData.betrag_netto_cent,
                        mwst_cent: formData.mwst_betrag_cent
                    });
                }
                
                // Validate invoice number uniqueness if provided
                if (formData.rechnungsnummer) {
                    const isValid = await validateInvoiceNumber();
                    if (!isValid) {
                        showNotification('Rechnungsnummer bereits vorhanden!', 'error');
                        return;
                    }
                }
                
                // Handle attachment upload
                const belegInput = document.getElementById('booking-beleg');
                if (belegInput.files && belegInput.files[0]) {
                    const file = belegInput.files[0];
                    const invoiceNo = formData.rechnungsnummer ? formData.rechnungsnummer.trim() : 'Rechnung';
                    const dateStr = formData.datum || new Date().toISOString().split('T')[0];
                    const newFileName = `${invoiceNo}-${dateStr}.pdf`;
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    formData.beleg = {
                        name: newFileName,
                        type: file.type,
                        data: base64
                    };
                }
                if (!formData.beleg && existingBuchung?.beleg) {
                    formData.beleg = existingBuchung.beleg;
                }

                console.log('Saving booking data:', formData);
                
                // Save booking
                try {
                    if (editingId) {
                        await app.db.put('buchungen', formData);
                        console.log('✅ Booking updated successfully in IndexedDB');
                    } else {
                        await app.db.add('buchungen', formData);
                        console.log('✅ Booking saved successfully to IndexedDB');
                    }
                } catch (dbError) {
                    console.error('❌ Database save error:', dbError);
                    showNotification('Fehler beim Speichern in die Datenbank: ' + dbError.message, 'error');
                    return;
                }
                
                // Refresh data
                console.log('Refreshing dashboard data...');
                await app.loadBuchungen();
                await app.loadDashboard();
                console.log('✅ Data refreshed successfully');
                
                // Close modal and show success
                closeBookingModal();
                
                if (editingId) {
                    showNotification('Buchung aktualisiert', 'success');
                } else {
                    const typeText = bookingType === 'einnahme' ? 'Einnahme' : 'Ausgabe';
                    showNotification(`${typeText} erfolgreich gespeichert! ${formData.rechnungsnummer ? `(${formData.rechnungsnummer})` : ''}`, 'success');
                }
                
            } catch (error) {
                console.error('Error saving booking:', error);
                showNotification('Fehler beim Speichern der Buchung', 'error');
            } finally {
                // Re-enable submit button
                submitButton.disabled = false;
                const buttonText = bookingType === 'einnahme' ? 
                    '<i data-lucide="save" class="h-4 w-4"></i> Einnahme speichern' : 
                    '<i data-lucide="save" class="h-4 w-4"></i> Ausgabe speichern';
                submitButton.innerHTML = buttonText;
                
                // Refresh lucide icons
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        }

        // Konto form handler
        document.getElementById('konto-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const kontoData = {
                nummer: parseInt(document.getElementById('konto-nummer').value),
                name: document.getElementById('konto-name').value,
                typ: document.getElementById('konto-typ').value,
                kategorie: document.getElementById('konto-kategorie').value,
                beschreibung: document.getElementById('konto-beschreibung').value || null,
                aktiv: true
            };
            
            try {
                const existingKonto = e.target.dataset.kontoNummer;
                
                if (existingKonto) {
                    // Update existing konto
                    await app.db.put('konten', kontoData);
                    showNotification(`Konto "${kontoData.name}" wurde aktualisiert`, 'success');
                } else {
                    // Check if account number already exists
                    const existing = await app.db.get('konten', kontoData.nummer);
                    if (existing) {
                        showNotification('Kontonummer bereits vorhanden', 'error');
                        return;
                    }
                    
                    await app.db.add('konten', kontoData);
                    showNotification(`Konto "${kontoData.name}" wurde erstellt`, 'success');
                }
                
                closeKontoModal();
                await loadKonten();
                
                // Re-enable nummer field for next use
                document.getElementById('konto-nummer').disabled = false;
                
            } catch (error) {
                console.error('Error saving konto:', error);
                showNotification('Fehler beim Speichern des Kontos', 'error');
            }
        });
        
        // Product form handler
        async function handleProductSubmit(event) {
            event.preventDefault();
            
            try {
                const nettoPreis = parseFloat(document.getElementById('product-preis-netto').value);
                const mwstSatz = parseInt(document.getElementById('product-mwst-satz').value);

                const variantTotal = currentVariants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
                const inputStock = parseInt(document.getElementById('product-bestand').value) || 0;
                const wareData = {
                    name: document.getElementById('product-name').value,
                    artikelnummer: document.getElementById('product-artikelnummer').value || null,
                    beschreibung: document.getElementById('product-beschreibung').value || null,
                    kategorie: document.getElementById('product-kategorie').value || null,
                    lieferant: document.getElementById('product-lieferant').value || null,
                    preis_netto: nettoPreis,
                    preis_netto_cent: app.euroToCent(nettoPreis),
                    preis_brutto_cent: app.euroToCent(nettoPreis * (1 + mwstSatz / 100)),
                    mwst_satz: mwstSatz,
                    bestand: parseInt(document.getElementById('product-bestand').value) || 0,
                    mindestbestand: parseInt(document.getElementById('product-mindestbestand').value) || 5,
                    varianten: currentVariants,
                    aktiv: true
                };
                
                if (app.isEditingProduct && app.currentProduct) {
                    // Update existing product
                    const updatedProduct = { ...app.currentProduct, ...wareData };
                    await app.db.put('waren', updatedProduct);
                    showNotification('Produkt wurde erfolgreich aktualisiert', 'success');
                } else {
                    // Create new product - generate ID
                    wareData.id = app.db.generateUUID();
                    await app.db.add('waren', wareData);
                    showNotification('Produkt wurde erfolgreich erstellt', 'success');
                }
                
                closeProductModal();
                await app.loadWaren();
                await app.loadDashboard();
            } catch (error) {
                console.error('Error saving product:', error);
                showNotification('Fehler beim Speichern des Produkts: ' + error.message, 'error');
            }
        }

        // =====================================
        // PRODUCT MANAGEMENT
        // =====================================

        async function editProduct(productId) {
            openProductModal(productId);
        }

        async function deleteProduct(productId) {
            try {
                                // Normalize ID to support both numeric and string keys
                const normalizedId = (typeof productId === 'string' && !isNaN(productId))
                    ? Number(productId)
                    : productId;

                const product = await app.db.get('waren', normalizedId);
                if (!product) {
                    showNotification('Produkt nicht gefunden', 'error');
                    return;
                }
                
                openDeleteModal(`Möchten Sie das Produkt "${product.name}" wirklich löschen?`, async () => {
                    try {
                        await app.db.delete('waren', normalizedId);
                        await app.loadWaren();
                        await app.loadDashboard();
                        showNotification(`Produkt "${product.name}" wurde gelöscht`, 'success');
                    } catch (error) {
                        console.error('Error deleting product:', error);
                        showNotification('Fehler beim Löschen des Produkts', 'error');
                    }
                });
            } catch (error) {
                console.error('Error loading product for deletion:', error);
                showNotification('Fehler beim Laden des Produkts', 'error');
            }
        }

        // Neues Bestandsanpassung-System
        let currentStockProduct = null;
        let currentStockAction = null;

        function openStockAdjustmentModal(productId, action) {
            // Critical fix: Check if app is initialized
            if (!app || !app.db) {
                console.warn('App not initialized for stock adjustment');
                showNotification('System wird noch geladen, bitte warten...', 'warning');
                return;
            }
            
            console.log(`Opening stock adjustment modal: ${productId}, action: ${action}`);
            
            currentStockProduct = productId;
            currentStockAction = action; // 'increase' or 'decrease'
            
            try {
                // Get product data
                app.db.get('waren', productId).then(product => {
                    if (!product) {
                        showNotification('Produkt nicht gefunden', 'error');
                        return;
                    }
                    
                    console.log('Product loaded for stock adjustment:', product);
                    
                    const modal = document.getElementById('stock-adjustment-modal');
                    const title = document.getElementById('stock-modal-title');
                    const subtitle = document.getElementById('stock-modal-subtitle');
                    const icon = document.querySelector('#stock-icon i');
                    const iconContainer = document.getElementById('stock-icon');
                    const label = document.getElementById('stock-adjustment-label');
                    const submitBtn = document.getElementById('stock-submit-btn');
                    
                    // Set product info
                    document.getElementById('stock-product-name').textContent = product.name;
                    document.getElementById('stock-current-amount').textContent = product.bestand || 0;
                    document.getElementById('stock-min-amount').textContent = product.mindestbestand || 0;
                    
                    // Show product price info
                    const produktPreis = (product.preis_netto_cent || 0) / 100;
                    document.getElementById('stock-product-price').textContent = `${produktPreis.toFixed(2)} €/Stk.`;
                    
                    // Configure based on action
                    if (action === 'increase') {
                        title.textContent = 'Bestand erhöhen (+)';
                        subtitle.textContent = 'Waren zum Lager hinzufügen';
                        
                        // Safe icon configuration
                        if (icon) {
                            icon.setAttribute('data-lucide', 'plus');
                            icon.className = 'h-6 w-6 text-green-600';
                        } else {
                            console.warn('Icon element not found for increase action');
                        }
                        
                        iconContainer.className = 'p-2 rounded-full bg-green-100';
                        label.textContent = 'Menge hinzufügen (+)';
                        submitBtn.className = 'btn btn-green';
                        submitBtn.innerHTML = '<i data-lucide="plus" class="h-4 w-4"></i> Bestand erhöhen';
                    } else {
                        title.textContent = 'Bestand reduzieren (-)';
                        subtitle.textContent = 'Waren aus dem Lager entfernen';
                        
                        // Safe icon configuration
                        if (icon) {
                            icon.setAttribute('data-lucide', 'minus');
                            icon.className = 'h-6 w-6 text-orange-600';
                        } else {
                            console.warn('Icon element not found for decrease action');
                        }
                        
                        iconContainer.className = 'p-2 rounded-full bg-orange-100';
                        label.textContent = 'Menge abziehen (-)';
                        submitBtn.className = 'btn bg-orange-600 text-white hover:bg-orange-700';
                        submitBtn.innerHTML = '<i data-lucide="minus" class="h-4 w-4"></i> Bestand reduzieren';
                    }
                    
                    // Reset form
                    document.getElementById('stock-adjustment-form').reset();
                    document.getElementById('stock-result-preview').textContent = 'Neuer Bestand: -- Stk.';
                    document.getElementById('stock-total-value').textContent = 'Gesamtwert: 0,00 €';
                    
                    // Add input listener for live preview with price calculation
                    const inputField = document.getElementById('stock-adjustment-value');
                    inputField.oninput = function() {
                        const adjustment = parseInt(this.value) || 0;
                        const currentStock = product.bestand || 0;
                        const newStock = action === 'increase' ? 
                            currentStock + adjustment : 
                            currentStock - adjustment;
                        
                        // Calculate total value
                        const totalValue = adjustment * produktPreis;
                        
                        document.getElementById('stock-result-preview').textContent = 
                            `Neuer Bestand: ${newStock} Stk.`;
                        document.getElementById('stock-total-value').textContent = 
                            `Gesamtwert: ${totalValue.toFixed(2)} €`;
                            
                        // Warning for negative stock
                        if (newStock < 0) {
                            document.getElementById('stock-result-preview').className = 'text-xs text-red-500 mt-2';
                            document.getElementById('stock-result-preview').textContent += ' ⚠️ Negativer Bestand!';
                        } else {
                            document.getElementById('stock-result-preview').className = 'text-xs text-gray-500 mt-2';
                        }
                    };
                    
                    // Show modal
                    modal.classList.add('active');
                    inputField.focus();
                    
                    console.log('✅ Stock adjustment modal opened successfully');
                    
                    // Refresh lucide icons
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                }).catch(error => {
                    console.error('Error loading product for stock adjustment:', error);
                    showNotification('Fehler beim Laden des Produkts', 'error');
                });
            } catch (error) {
                console.error('Error opening stock adjustment modal:', error);
                showNotification('Fehler beim Öffnen des Lager-Modals', 'error');
            }
        }

        // Stock adjustment calculation functions
        function updateStockPreview() {
            calculateStockTotals();
            
            const currentStock = parseInt(document.getElementById('stock-current-amount').textContent) || 0;
            const adjustmentValue = parseInt(document.getElementById('stock-adjustment-value').value) || 0;
            const action = currentStockAction; // Global variable set in openStockAdjustmentModal
            
            let newStock;
            if (action === 'increase') {
                newStock = currentStock + adjustmentValue;
            } else {
                newStock = Math.max(0, currentStock - adjustmentValue);
            }
            
            const preview = document.getElementById('stock-result-preview');
            preview.textContent = `Neuer Bestand: ${newStock} Stk.`;
            
            // Show warning for low stock
            const minStock = parseInt(document.getElementById('stock-min-amount').textContent) || 0;
            if (newStock <= minStock && newStock > 0) {
                preview.className = 'text-xs text-orange-500 mt-2';
                preview.textContent += ' (Warnung: Niedrig!)';
            } else if (newStock === 0) {
                preview.className = 'text-xs text-red-500 mt-2';
                preview.textContent += ' (Achtung: Leer!)';
            } else {
                preview.className = 'text-xs text-gray-500 mt-2';
            }
        }
        
        function calculateStockTotals() {
            const quantity = parseFloat(document.getElementById('stock-adjustment-value').value) || 0;
            const unitPrice = parseFloat(document.getElementById('stock-unit-price').value) || 0;
            
            if (quantity > 0 && unitPrice > 0) {
                const total = quantity * unitPrice;
                document.getElementById('stock-total-price').value = total.toFixed(2);
            }
        }
        
        function calculateStockFromTotal() {
            const quantity = parseFloat(document.getElementById('stock-adjustment-value').value) || 0;
            const totalPrice = parseFloat(document.getElementById('stock-total-price').value) || 0;
            
            if (quantity > 0 && totalPrice > 0) {
                const unitPrice = totalPrice / quantity;
                document.getElementById('stock-unit-price').value = unitPrice.toFixed(2);
            }
        }
        
        function closeStockAdjustmentModal() {
            document.getElementById('stock-adjustment-modal').classList.remove('active');
            // Clear form fields
            document.getElementById('stock-adjustment-value').value = '';
            document.getElementById('stock-unit-price').value = '';
            document.getElementById('stock-total-price').value = '';
            document.getElementById('stock-adjustment-note').value = '';
            document.getElementById('stock-result-preview').textContent = 'Neuer Bestand: -- Stk.';
            
            currentStockProduct = null;
            currentStockAction = null;
        }

        async function handleStockAdjustment(event) {
            event.preventDefault();
            
            if (!currentStockProduct || !currentStockAction) {
                showNotification('Fehler: Kein Produkt ausgewählt', 'error');
                return;
            }
            
            try {
                const adjustmentValue = parseInt(document.getElementById('stock-adjustment-value').value);
                const unitPrice = parseFloat(document.getElementById('stock-unit-price').value) || 0;
                const totalPrice = parseFloat(document.getElementById('stock-total-price').value) || 0;
                const note = document.getElementById('stock-adjustment-note').value;
                
                if (!adjustmentValue || adjustmentValue <= 0) {
                    showNotification('Bitte gültige Menge eingeben!', 'error');
                    return;
                }
                
                // Calculate final unit price
                let finalUnitPrice = unitPrice;
                if (!finalUnitPrice && totalPrice && adjustmentValue > 0) {
                    finalUnitPrice = totalPrice / adjustmentValue;
                }
                
                // Get current product
                const product = await app.db.get('waren', currentStockProduct);
                if (!product) {
                    showNotification('Produkt nicht gefunden', 'error');
                    return;
                }
                
                const currentStock = product.bestand || 0;
                const adjustment = currentStockAction === 'increase' ? adjustmentValue : -adjustmentValue;
                const newStock = currentStock + adjustment;
                
                // Confirm negative stock
                if (newStock < 0) {
                    const proceed = confirm(`Bestand würde negativ werden (${newStock}). Trotzdem fortfahren?`);
                    if (!proceed) return;
                }
                
                // Update product stock & weighted average price (when increasing and a price is provided)
                if (currentStockAction === 'increase' && finalUnitPrice > 0 && adjustmentValue > 0) {
                    const unitCent = Math.round(finalUnitPrice * 100);
                    const oldAvg = Number.isFinite(product.avg_price_cent) ? product.avg_price_cent
                                  : (Number.isFinite(product.preis_brutto_cent) ? product.preis_brutto_cent
                                  : (product.preis_netto_cent || 0));
                    const weighted = newStock > 0
                      ? Math.round(((currentStock * (oldAvg || 0)) + (adjustmentValue * unitCent)) / newStock)
                      : unitCent;
                    product.avg_price_cent = weighted;
                    product.preis_brutto_cent = weighted; // keep legacy compatibility
                }
                product.bestand = newStock;
                await app.db.put('waren', product);
                
                // Create stock movement record with pricing information
                const finalTotalValue = finalUnitPrice * adjustmentValue;
                const movement = {
                    id: app.db.generateUUID(),
                    typ: currentStockAction === 'increase' ? 'zugang' : 'abgang',
                    productId: currentStockProduct,
                    productName: product.name,
                    menge: adjustmentValue,
                    quantity: adjustmentValue, // For compatibility
                    preis_pro_stueck_cent: Math.round(finalUnitPrice * 100),
                    unitPrice: finalUnitPrice, // For compatibility
                    gesamtwert_cent: Math.round(finalTotalValue * 100),
                    totalValue: finalTotalValue, // For compatibility
                    alterBestand: currentStock,
                    neuerBestand: newStock,
                    notiz: note,
                    notes: note, // For compatibility
                    userId: app.currentUser?.id,
                    userName: app.currentUser?.name,
                    userKuerzel: app.currentUser?.kuerzel,
                    timestamp: new Date().toISOString(),
                    typ_detail: currentStockAction === 'increase' ? 'Bestandserhöhung' : 'Bestandsreduzierung'
                };
                
                await app.db.add('lagerbewegungen', movement);
                
                // CREATE AUTOMATIC ACCOUNTING ENTRY (Einnahme/Ausgabe) if price is provided
                if (finalUnitPrice > 0) {
                    const gesamtwert = finalTotalValue;
                    const gesamtwert_cent = Math.round(finalTotalValue * 100);
                    const buchungsTyp = currentStockAction === 'increase' ? 'ausgabe' : 'einnahme';
                    const beschreibung = currentStockAction === 'increase' ? 
                        `Wareneinkauf: ${product.name} (${adjustmentValue} Stk.)` :
                        `Warenverkauf: ${product.name} (${adjustmentValue} Stk.)`;
                    
                    const buchung = {
                        id: app.db.generateUUID(),
                        kundeName: currentStockAction === 'increase' ? 
                            (product.lieferant || 'Lieferant') : 
                            'Lagerverkauf',
                        beschreibung: beschreibung,
                        datum: new Date().toISOString().split('T')[0],
                        betrag: gesamtwert,
                        betrag_brutto_cent: gesamtwert_cent,
                        betrag_netto_cent: Math.round(gesamtwert_cent / 1.19), // 19% MwSt
                        mwst_satz: 19,
                        mwst_betrag_cent: gesamtwert_cent - Math.round(gesamtwert_cent / 1.19),
                        konto: currentStockAction === 'increase' ? 3200 : 4000, // Wareneinkauf oder Umsatz
                        kategorie: 'Lagerbuchung',
                        notizen: `Automatische Buchung durch Lageränderung: ${note || ''}`,
                        typ: buchungsTyp,
                        lagerbewegung_id: movement.id,
                        timestamp: new Date().toISOString()
                    };
                    
                    await app.db.add('buchungen', buchung);
                    console.log(`✅ Automatische ${buchungsTyp} erstellt: ${gesamtwert.toFixed(2)}€`);
                }
                
                // Refresh data
                await app.loadWaren();
                await app.loadBewegungen();
                await app.loadDashboard();
                
                closeStockAdjustmentModal();
                
                const actionText = currentStockAction === 'increase' ? 'erhöht' : 'reduziert';
                showNotification(`Bestand für "${product.name}" ${actionText}: ${currentStock} → ${newStock} Stk.`, 'success');
                
            } catch (error) {
                console.error('Error adjusting stock:', error);
                showNotification('Fehler beim Anpassen des Bestands', 'error');
            }
        }
        async function editBuchung(buchungId) {
            try {
                const buchung = await app.db.get('buchungen', buchungId);
                if (!buchung) {
                    showNotification('Buchung nicht gefunden', 'error');
                    return;
                }

                app.editingBuchungId = buchungId;
                openBookingModal(buchung.typ || 'einnahme');

                document.getElementById('modal-title').textContent = 'Buchung bearbeiten';
                document.getElementById('modal-subtitle').textContent = 'Bestehende Buchung anpassen';
                const submitBtn = document.getElementById('booking-submit-btn');
                submitBtn.innerHTML = '<i data-lucide="save" class="h-4 w-4"></i> Aktualisieren';
                const icon = document.querySelector('#modal-icon i');
                if (icon) {
                    icon.setAttribute('data-lucide', 'pencil');
                }

                document.getElementById('booking-kunde-name').value = buchung.kundeName || '';
                document.getElementById('booking-rechnung-nummer').value = buchung.rechnungsnummer || '';
                document.getElementById('booking-beschreibung').value = buchung.beschreibung || '';
                document.getElementById('booking-datum').value = buchung.datum || new Date().toISOString().split('T')[0];
                document.getElementById('booking-betrag').value = (buchung.betrag_brutto_cent / 100).toFixed(2);
                document.getElementById('booking-netto').value = (buchung.betrag_netto_cent / 100).toFixed(2);
                document.getElementById('booking-mwst').value = buchung.mwst_satz || 19;
                document.getElementById('booking-konto').value = buchung.account || buchung.konto || '';
                document.getElementById('booking-kategorie').value = buchung.kategorie || '';
                document.getElementById('booking-notizen').value = buchung.notizen || '';

                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            } catch (error) {
                console.error('Error editing booking:', error);
                showNotification('Fehler beim Laden der Buchung', 'error');
            }
        }

        async function deleteBuchung(buchungId) {
            try {
                const buchung = await app.db.get('buchungen', buchungId);
                if (!buchung) {
                    showNotification('Buchung nicht gefunden', 'error');
                    return;
                }
                
                openDeleteModal(`Möchten Sie die Buchung "${buchung.beschreibung}" wirklich löschen?`, async () => {
                    try {
                        await app.db.delete('buchungen', buchungId);
                        await app.loadBuchungen();
                        await app.loadDashboard();
                        await app.loadRecentActivities();
                        showNotification('Buchung wurde gelöscht', 'success');
                    } catch (error) {
                        console.error('Error deleting booking:', error);
                        showNotification('Fehler beim Löschen der Buchung', 'error');
                    }
                });
            } catch (error) {
                console.error('Error loading booking for deletion:', error);
                showNotification('Fehler beim Laden der Buchung', 'error');
            }
        }

        function openBuchungBeleg(btn) {
            try {
                const dataUrl = btn.getAttribute('data-beleg');
                if (!dataUrl) return;

                const [header, base64] = dataUrl.split(',');
                const mimeMatch = header.match(/:(.*?);/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';

                const byteChars = atob(base64);
                const byteNumbers = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                    byteNumbers[i] = byteChars.charCodeAt(i);
                }
                const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
                const url = URL.createObjectURL(blob);
                // Open PDF in a new tab without forcing download
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error('Error opening attachment:', error);
            showNotification('Fehler beim Öffnen des Belegs', 'error');
        }
    }

        function parseNumber(value) {
            const parsed = parseFloat(String(value).replace(',', '.'));
            return isNaN(parsed) ? 0 : parsed;
        }

        // Automatic calculation functions for Wareneingang
        function calculateWareneingangTotals() {
            const quantity = parseFloat(document.getElementById('wareneingang-quantity').value) || 0;
            const unitPrice = parseFloat(document.getElementById('wareneingang-price').value) || 0;
            
            if (quantity > 0 && unitPrice > 0) {
                const total = quantity * unitPrice;
                document.getElementById('wareneingang-total').value = total.toFixed(2);
            }
        }
        
        function calculateWareneingangFromTotal() {
            const quantity = parseFloat(document.getElementById('wareneingang-quantity').value) || 0;
            const totalPrice = parseFloat(document.getElementById('wareneingang-total').value) || 0;
            
            if (quantity > 0 && totalPrice > 0) {
                const unitPrice = totalPrice / quantity;
                document.getElementById('wareneingang-price').value = unitPrice.toFixed(2);
            }
        }
        
        // Automatic calculation functions for Warenausgang
        function calculateWarenausgangTotals() {
            const quantity = parseFloat(document.getElementById('warenausgang-quantity').value) || 0;
            const unitPrice = parseNumber(document.getElementById('warenausgang-price').value);
            
            if (quantity > 0 && unitPrice > 0) {
                const total = quantity * unitPrice;
                document.getElementById('warenausgang-total').value = total.toFixed(2);
            }
        }
        
        function calculateWarenausgangFromTotal() {
            const quantity = parseFloat(document.getElementById('warenausgang-quantity').value) || 0;
            const totalPrice = parseNumber(document.getElementById('warenausgang-total').value);
            
            if (quantity > 0 && totalPrice > 0) {
                const unitPrice = totalPrice / quantity;
                document.getElementById('warenausgang-price').value = unitPrice.toFixed(2);
            }
        }
        // Konto Modal Management
        function openKontoModal(kontoNummer = null) {
            const modal = document.getElementById('konto-modal');
            const title = document.getElementById('konto-modal-title');
            const form = document.getElementById('konto-form');
            const submitBtn = form.querySelector('button[type="submit"]');
            
            if (kontoNummer) {
                title.textContent = 'Konto bearbeiten';
                submitBtn.textContent = 'Konto speichern';
                form.dataset.kontoNummer = kontoNummer;
                // Load existing konto data here if needed
            } else {
                title.textContent = 'Neues Konto';
                submitBtn.textContent = 'Konto anlegen';
                form.removeAttribute('data-konto-nummer');
            }
            
            modal.classList.add('active');
        }

        function closeKontoModal() {
            const modal = document.getElementById('konto-modal');
            modal.classList.remove('active');
            document.getElementById('konto-form').reset();
        }

        // =====================================
        // MOVEMENT MODAL FUNCTIONS
        // =====================================

        // Wareneingang Modal Management
        function openWareneingangModal() {
            const modal = document.getElementById('wareneingang-modal');
            const form = document.getElementById('wareneingang-form');
            
            // Reset form
            form.reset();
            document.getElementById('warenausgang-auto-booking').checked = true;

            // Load products
            app.loadProductFilters();
            
            modal.classList.add('active');
        }

        function closeWareneingangModal() {
            const modal = document.getElementById('wareneingang-modal');
            modal.classList.remove('active');
            document.getElementById('wareneingang-form').reset();
            // Clear calculated fields
            document.getElementById('wareneingang-total').value = '';
        }

        // Warenausgang Modal Management
        function openWarenausgangModal() {
            const modal = document.getElementById('warenausgang-modal');
            const form = document.getElementById('warenausgang-form');
            
            // Reset form
            form.reset();
            
            // Load products
            app.loadProductFilters();
            
            // Clear stock info
            document.getElementById('available-stock').textContent = '';
            
            modal.classList.add('active');
        }

        function closeWarenausgangModal() {
            const modal = document.getElementById('warenausgang-modal');
            modal.classList.remove('active');
            document.getElementById('warenausgang-form').reset();
            document.getElementById('available-stock').textContent = '';
            // Clear calculated fields
            document.getElementById('warenausgang-total').value = '';
        }

        // Update available stock when product is selected
        async function updateAvailableStock() {
    const productSelect = document.getElementById('warenausgang-product');
    const stockDiv = document.getElementById('available-stock');
    const quantityInput = document.getElementById('warenausgang-quantity');

    if (!productSelect.value) {
        stockDiv.textContent = '';
        quantityInput.max = '';
        return;
    }

    try {
        const product = await app.db.get('waren', productSelect.value);
        if (product) {
            // Use the canonical field 'bestand' for stock
            const stock = product.bestand || 0;
            stockDiv.textContent = `Verfügbar: ${stock} Stück`;
            quantityInput.max = stock;
            const submitBtn = document.querySelector('#warenausgang-form [type="submit"]');
            if (submitBtn) submitBtn.disabled = (stock === 0);

            if (stock === 0) {
                stockDiv.className = 'text-xs text-red-500 mt-1';
                stockDiv.textContent = 'Achtung: Kein Bestand verfügbar!';
            } else if (stock <= (product.mindestbestand || 0)) {
                stockDiv.className = 'text-xs text-orange-500 mt-1';
                stockDiv.textContent = `Verfügbar: ${stock} Stück (Niedrig!)`;
            } else {
                stockDiv.className = 'text-xs text-gray-500 mt-1';
            }

            // Sensible default selling price (brutto) if empty:
            const priceInput = document.getElementById('warenausgang-price');
            if (priceInput && !priceInput.value) {
                if (typeof product.preis_brutto_cent === 'number') {
                    priceInput.value = (product.preis_brutto_cent / 100).toFixed(2);
                } else if (typeof product.preis_netto_cent === 'number') {
                    const mwst = typeof product.mwst_satz === 'number' ? product.mwst_satz : 19;
                    priceInput.value = ((product.preis_netto_cent * (1 + mwst / 100)) / 100).toFixed(2);
                }
            }
        }
    } catch (error) {
        console.error('Error loading product stock:', error);
        stockDiv.textContent = 'Fehler beim Laden der Bestandsinformationen';
        stockDiv.className = 'text-xs text-red-500 mt-1';
    }
}

        // Save Wareneingang
        async function saveWareneingang(event) {
            event.preventDefault();
            
            try {
                const productId = document.getElementById('wareneingang-product').value;
                const quantity = parseInt(document.getElementById('wareneingang-quantity').value);
                let price = parseFloat(document.getElementById('wareneingang-price').value) || 0;
                const totalPrice = parseFloat(document.getElementById('wareneingang-total').value) || 0;
                const supplier = document.getElementById('wareneingang-supplier').value;
                const reference = document.getElementById('wareneingang-reference').value;
                const notes = document.getElementById('wareneingang-notes').value;
                const autoBooking = document.getElementById('wareneingang-auto-booking').checked;
                                const belegInput = document.getElementById('wareneingang-beleg');
                let beleg = null;
                if (belegInput.files && belegInput.files[0]) {
                    const file = belegInput.files[0];
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    beleg = {
                        name: file.name,
                        type: file.type,
                        data: base64
                    };
                }

                console.log('Wareneingang data:', { productId, quantity, price, totalPrice, supplier, reference, notes, autoBooking });
                
                // Validation
                if (!productId) {
                    showNotification('Bitte Produkt auswählen!', 'error');
                    return;
                }
                
                if (!quantity || quantity <= 0) {
                    showNotification('Bitte gültige Menge eingeben!', 'error');
                    return;
                }
                
                // Use total price to calculate unit price if no unit price provided
                if (!price && totalPrice && quantity > 0) {
                    price = totalPrice / quantity;
                }
                
                // Calculate total value
                const totalValue = quantity * price;
                
                // Get product details
                const product = await app.db.get('waren', productId);
                if (!product) {
                    showNotification('Produkt nicht gefunden!', 'error');
                    return;
                }
                
                console.log('Product found:', product);
                
                // Update product stock
                const oldStock = product.bestand || 0;
                const newStock = oldStock + quantity;
                product.bestand = newStock;

                // Update weighted average price (avg_price_cent) based on entered unit price
                (function () {
                    const unitCent = Math.round((price || 0) * 100);
                    const oldAvg = Number.isFinite(product.avg_price_cent) ? product.avg_price_cent
                                  : (Number.isFinite(product.preis_brutto_cent) ? product.preis_brutto_cent
                                  : (product.preis_netto_cent || 0));
                    const newAvg = newStock > 0
                      ? Math.round(((oldStock * (oldAvg || 0)) + (quantity * unitCent)) / newStock)
                      : unitCent;
                    product.avg_price_cent = newAvg;
                    product.preis_brutto_cent = newAvg; // keep legacy compatibility
                })();

                
                // Update supplier if provided
                if (supplier && supplier.trim()) {
                    product.lieferant = supplier.trim();
                }
                
                // Save updated product
                await app.db.put('waren', product);
                console.log('Product stock updated:', { oldStock, newStock });
                
                // Create movement record
                const movement = {
                    id: app.db.generateUUID(),
                    typ: 'eingang',
                    type: 'eingang', // For compatibility
                    productId: productId,
                    productName: product.name,
                    menge: quantity,
                    quantity: quantity, // For compatibility
                    preis_pro_stueck_cent: Math.round(price * 100),
                    unitPrice: price, // For compatibility
                    gesamtwert_cent: Math.round(totalValue * 100),
                    totalValue: totalValue, // For compatibility
                    lieferant: supplier || '',
                    referenz: reference || '',
                    notizen: notes || '',
                    supplier: supplier || '', // For compatibility
                    reference: reference || '', // For compatibility
                    notes: notes || '', // For compatibility
                    beleg: beleg,
                    userId: app.currentUser?.id,
                    userName: app.currentUser?.name,
                    userKuerzel: app.currentUser?.kuerzel,
                    datum: new Date().toISOString().split('T')[0],
                    timestamp: new Date().toISOString(),
                    automatischeBuchung: autoBooking
                };
                
                console.log('Movement to save:', movement);
                
                // Save movement
                await app.db.add('lagerbewegungen', movement);
                console.log('Movement saved successfully');
                
                // Automatic booking for Wareneingang removed
                
                // Refresh data
                await app.loadWaren();
                await app.loadBewegungen();
                await app.loadDashboard();
                
                console.log('Data refreshed successfully');
                
                closeWareneingangModal();
                
                showNotification('Wareneingang erfolgreich erfasst!', 'success');
                
            } catch (error) {
                console.error('Error saving wareneingang:', error);
                showNotification(`Fehler beim Speichern des Wareneingangs: ${error.message}`, 'error');
            }
        }

        // Save Warenausgang
        async function saveWarenausgang(event) {
            event.preventDefault();
            
            try {
                const productId = document.getElementById('warenausgang-product').value;
                const quantity = parseInt(document.getElementById('warenausgang-quantity').value);
                let price = parseNumber(document.getElementById('warenausgang-price').value);
                const totalPrice = parseNumber(document.getElementById('warenausgang-total').value);
                const customer = document.getElementById('warenausgang-customer').value;
                const reference = document.getElementById('warenausgang-reference').value;
                const reason = document.getElementById('warenausgang-reason').value;
                const notes = document.getElementById('warenausgang-notes').value;
                const autoBooking = document.getElementById('warenausgang-auto-booking').checked;
                
                console.log('Warenausgang data:', { productId, quantity, price, totalPrice, customer, reference, reason, notes, autoBooking });
                
                // Validation
                if (!productId) {
                    showNotification('Bitte Produkt auswählen!', 'error');
                    return;
                }
                
                if (!quantity || quantity <= 0) {
                    showNotification('Bitte gültige Menge eingeben!', 'error');
                    return;
                }
                
                // Use total price to calculate unit price if no unit price provided
                if (!price && totalPrice && quantity > 0) {
                    price = totalPrice / quantity;
                }
                
                // Calculate total value
                const totalValue = quantity * price;
                
                // Get product details
                const product = await app.db.get('waren', productId);
                if (!product) {
                    showNotification('Produkt nicht gefunden!', 'error');
                    return;
                }
                
                console.log('Product found:', product);
                
                // Check stock availability
                const currentStock = product.bestand || 0;
                if (quantity > currentStock) {
                    const proceed = confirm(`Achtung: Sie möchten ${quantity} Stück ausbuchen, aber nur ${currentStock} sind verfügbar. Trotzdem fortfahren?`);
                    if (!proceed) return;
                }
                
                // Update product stock
                const oldStock = currentStock;
                const newStock = Math.max(0, currentStock - quantity);
                product.bestand = newStock;
                
                // Save updated product
                await app.db.put('waren', product);
                console.log('Product stock updated:', { oldStock, newStock });
                
                // Create movement record
                const movement = {
                    id: app.db.generateUUID(),
                    typ: 'ausgang',
                    type: 'ausgang', // For compatibility
                    productId: productId,
                    productName: product.name,
                    menge: quantity,
                    quantity: quantity, // For compatibility
                    preis_pro_stueck_cent: Math.round(price * 100),
                    unitPrice: price, // For compatibility
                    gesamtwert_cent: Math.round(totalValue * 100),
                    totalValue: totalValue, // For compatibility
                    kunde: customer || '',
                    referenz: reference || '',
                    grund: reason || 'sonstiges',
                    notizen: notes || '',
                    customer: customer || '', // For compatibility
                    reference: reference || '', // For compatibility
                    reason: reason || 'sonstiges', // For compatibility
                    notes: notes || '', // For compatibility
                    userId: app.currentUser?.id,
                    userName: app.currentUser?.name,
                    userKuerzel: app.currentUser?.kuerzel,
                    datum: new Date().toISOString().split('T')[0],
                    timestamp: new Date().toISOString(),
                    automatischeBuchung: autoBooking
                };
                
                console.log('Movement to save:', movement);
                
                // Save movement
                await app.db.add('lagerbewegungen', movement);
                console.log('Movement saved successfully');
                
                // Create automatic booking if requested
                if (autoBooking && price > 0) {
                    try {
                        await createWarenausgangBooking(movement, product);
                        console.log('Automatic booking created');
                    } catch (bookingError) {
                        console.warn('Failed to create automatic booking:', bookingError);
                        // Don't fail the entire operation if booking fails
                    }
                }
                
                // Refresh data
                await app.loadWaren();
                await app.loadBewegungen();
                await app.loadDashboard();
                
                console.log('Data refreshed successfully');
                
                closeWarenausgangModal();
                
                const message = autoBooking && price > 0 ?
                    'Warenausgang erfasst und Buchung erstellt!' :
                    'Warenausgang erfolgreich erfasst!';
                showNotification(message, 'success');
                
                // Warning for low stock
                if (newStock <= (product.mindestbestand || 0) && newStock > 0) {
                    setTimeout(() => {
                        showNotification(`⚠️ Niedriger Lagerbestand bei "${product.name}": ${newStock} Stück`, 'warning');
                    }, 2000);
                } else if (newStock === 0) {
                    setTimeout(() => {
                        showNotification(`🚫 Lagerbestand leer bei "${product.name}"!`, 'warning');
                    }, 2000);
                }
                
            } catch (error) {
                console.error('Error saving warenausgang:', error);
                showNotification(`Fehler beim Speichern des Warenausgangs: ${error.message}`, 'error');
            }
        }

        // Automatic booking for Wareneingang removed

        // Create automatic booking for Warenausgang
        async function createWarenausgangBooking(movement, product) {
            try {
                // Find appropriate expense account (Wareneinsatz = 3200)
                const konten = await app.db.getAll('konten');
                const warenausgangKonto = konten.find(k => k.nummer === 3200) || konten.find(k => k.typ === 'Aufwand');

                if (!warenausgangKonto) {
                    console.warn('Could not find appropriate accounts for automatic booking');
                    return;
                }

                const bruttoCent = Math.round(movement.totalValue * 100);
                const nettoCent = Math.round((movement.totalValue / 1.19) * 100);
                const mwstCent = bruttoCent - nettoCent;

                const booking = {
                    id: app.db.generateUUID(),
                    date: new Date().toISOString().split('T')[0],
                    datum: new Date().toISOString().split('T')[0],
                    beschreibung: `Warenausgang: ${product.name} (${movement.quantity} Stk)`,
                    typ: 'ausgabe',
                    account: warenausgangKonto.nummer,
                    mwst_satz: 19,
                    betrag_brutto_cent: bruttoCent,
                    betrag_netto_cent: nettoCent,
                    mwst_betrag_cent: mwstCent,
                    betrag: movement.totalValue,
                    amount: movement.totalValue,
                    mwstBetrag: movement.totalValue - (movement.totalValue / 1.19),
                    kategorie: 'Warenausgang',
                    notizen: `Auto-Buchung für Bewegung: ${movement.id}`,
                    timestamp: new Date().toISOString(),
                    type: 'ausgabe'
                };
                
                await app.db.add('buchungen', booking);
                
            } catch (error) {
                console.error('Error creating warenausgang booking:', error);
            }
        }

        // =====================================
        // MOVEMENT FILTERING FUNCTIONS
        // =====================================

        // Filter movements based on criteria
        async function filterBewegungen() {
            try {
                const typeFilter = document.getElementById('bewegung-type-filter').value;
                const productFilter = document.getElementById('bewegung-product-filter').value;
                const dateFilter = document.getElementById('bewegung-date-filter').value;
                const searchQuery = document.getElementById('bewegung-search').value.toLowerCase();
                
                let bewegungen = await app.db.getAll('lagerbewegungen');
                
                // Apply type filter
                if (typeFilter) {
                    bewegungen = bewegungen.filter(b => b.type === typeFilter);
                }
                
                // Apply product filter
                if (productFilter) {
                    bewegungen = bewegungen.filter(b => b.productId === productFilter);
                }
                
                // Apply date filter
                if (dateFilter && dateFilter !== 'alle') {
                    bewegungen = filterBewegungsByDate(bewegungen, dateFilter);
                }
                
                // Apply search filter
                if (searchQuery) {
                    bewegungen = bewegungen.filter(b => 
                        (b.productName && b.productName.toLowerCase().includes(searchQuery)) ||
                        (b.supplier && b.supplier.toLowerCase().includes(searchQuery)) ||
                        (b.customer && b.customer.toLowerCase().includes(searchQuery)) ||
                        (b.reference && b.reference.toLowerCase().includes(searchQuery)) ||
                        (b.notes && b.notes.toLowerCase().includes(searchQuery))
                    );
                }
                
                // Sort by timestamp (newest first)
                bewegungen.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                app.displayBewegungen(bewegungen);
                
                // Show/hide custom date range
                const customDateRange = document.getElementById('bewegung-custom-date-range');
                if (dateFilter === 'custom') {
                    customDateRange.classList.remove('hidden');
                } else {
                    customDateRange.classList.add('hidden');
                }
                
            } catch (error) {
                console.error('Error filtering bewegungen:', error);
                showNotification('Fehler beim Filtern der Bewegungen', 'error');
            }
        }

        // Filter movements by date range
        function filterBewegungsByDate(bewegungen, dateFilter) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            switch (dateFilter) {
                case 'heute':
                    return bewegungen.filter(b => {
                        const bDate = new Date(b.timestamp);
                        const bDay = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate());
                        return bDay.getTime() === today.getTime();
                    });
                    
                case 'woche':
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
                    return bewegungen.filter(b => new Date(b.timestamp) >= weekStart);
                    
                case 'monat':
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    return bewegungen.filter(b => new Date(b.timestamp) >= monthStart);
                    
                case 'custom':
                    const fromDate = document.getElementById('bewegung-date-from').value;
                    const toDate = document.getElementById('bewegung-date-to').value;
                    
                    if (fromDate && toDate) {
                        const from = new Date(fromDate);
                        const to = new Date(toDate);
                        to.setHours(23, 59, 59); // Include full end date
                        
                        return bewegungen.filter(b => {
                            const bDate = new Date(b.timestamp);
                            return bDate >= from && bDate <= to;
                        });
                    }
                    return bewegungen;
                    
                default:
                    return bewegungen;
            }
        }

        // Reset movement filters
        function resetBewegungsFilter() {
            document.getElementById('bewegung-type-filter').value = '';
            document.getElementById('bewegung-product-filter').value = '';
            document.getElementById('bewegung-date-filter').value = 'alle';
            document.getElementById('bewegung-search').value = '';
            document.getElementById('bewegung-date-from').value = '';
            document.getElementById('bewegung-date-to').value = '';
            document.getElementById('bewegung-custom-date-range').classList.add('hidden');
            
            // Reload all movements
            app.loadBewegungen();
        }

        // =====================================
        // KONTEN MANAGEMENT FUNCTIONS
        async function loadKonten() {
            try {
                const konten = await app.db.getAll('konten');
                displayKonten(konten);
            } catch (error) {
                console.error('Error loading konten:', error);
                showNotification('Fehler beim Laden der Konten', 'error');
            }
        }

        function displayKonten(konten) {
            // Group konten by type
            const ertragskonten = konten.filter(k => k.typ === 'Ertrag');
            const aufwandskonten = konten.filter(k => k.typ === 'Aufwand');
            const aktivkonten = konten.filter(k => k.typ === 'Aktiv');
            const passivkonten = konten.filter(k => k.typ === 'Passiv');
            const steuerkonten = konten.filter(k => k.typ === 'Steuer');
            
            const kontenContainer = document.getElementById('konten-categories');
            if (!kontenContainer) return;
            
            let html = '';
            
            // Bilanzkonten (Aktiv)
            if (aktivkonten.length > 0) {
                html += `
                    <div class="card overflow-hidden mb-4">
                        <div class="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <i data-lucide="building" class="h-5 w-5"></i>
                                <span class="font-semibold">Aktivkonten (Bilanz)</span>
                            </div>
                            <span class="bg-white bg-opacity-20 px-2 py-1 rounded text-sm font-semibold">${aktivkonten.length}</span>
                        </div>
                        <div class="divide-y divide-gray-100">
                `;
                
                aktivkonten.forEach(konto => {
                    html += createKontoItem(konto);
                });
                
                html += `</div></div>`;
            }
            
            // Bilanzkonten (Passiv)
            if (passivkonten.length > 0) {
                html += `
                    <div class="card overflow-hidden mb-4">
                        <div class="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <i data-lucide="shield" class="h-5 w-5"></i>
                                <span class="font-semibold">Passivkonten (Bilanz)</span>
                            </div>
                            <span class="bg-white bg-opacity-20 px-2 py-1 rounded text-sm font-semibold">${passivkonten.length}</span>
                        </div>
                        <div class="divide-y divide-gray-100">
                `;
                
                passivkonten.forEach(konto => {
                    html += createKontoItem(konto);
                });
                
                html += `</div></div>`;
            }
            
            // Einnahmekonten
            if (ertragskonten.length > 0) {
                html += `
                    <div class="card overflow-hidden mb-4">
                        <div class="bg-green-600 text-white px-6 py-4 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <i data-lucide="trending-up" class="h-5 w-5"></i>
                                <span class="font-semibold">Einnahmekonten</span>
                            </div>
                            <span class="bg-white bg-opacity-20 px-2 py-1 rounded text-sm font-semibold">${ertragskonten.length}</span>
                        </div>
                        <div class="divide-y divide-gray-100">
                `;
                
                ertragskonten.forEach(konto => {
                    html += createKontoItem(konto);
                });
                
                html += `</div></div>`;
            }
            
            // Ausgabenkonten
            if (aufwandskonten.length > 0) {
                html += `
                    <div class="card overflow-hidden mb-4">
                        <div class="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <i data-lucide="trending-down" class="h-5 w-5"></i>
                                <span class="font-semibold">Ausgabenkonten</span>
                            </div>
                            <span class="bg-white bg-opacity-20 px-2 py-1 rounded text-sm font-semibold">${aufwandskonten.length}</span>
                        </div>
                        <div class="divide-y divide-gray-100">
                `;
                
                aufwandskonten.forEach(konto => {
                    html += createKontoItem(konto);
                });
                
                html += `</div></div>`;
            }
            
            // Steuerkonten
            if (steuerkonten.length > 0) {
                html += `
                    <div class="card overflow-hidden mb-4">
                        <div class="bg-purple-600 text-white px-6 py-4 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <i data-lucide="percent" class="h-5 w-5"></i>
                                <span class="font-semibold">Steuerkonten</span>
                            </div>
                            <span class="bg-white bg-opacity-20 px-2 py-1 rounded text-sm font-semibold">${steuerkonten.length}</span>
                        </div>
                        <div class="divide-y divide-gray-100">
                `;
                
                steuerkonten.forEach(konto => {
                    html += createKontoItem(konto);
                });
                
                html += `</div></div>`;
            }
            
            kontenContainer.innerHTML = html;

            // Update summary counters
            const totalEl = document.getElementById('konto-count-total');
            if (totalEl) totalEl.textContent = konten.length;
            const ertragEl = document.getElementById('konto-count-ertrag');
            if (ertragEl) ertragEl.textContent = ertragskonten.length;
            const aufwandEl = document.getElementById('konto-count-aufwand');
            if (aufwandEl) aufwandEl.textContent = aufwandskonten.length;
            const bilanzEl = document.getElementById('konto-count-bilanz');
            if (bilanzEl) bilanzEl.textContent = aktivkonten.length + passivkonten.length;
            const systemCountEl = document.getElementById('system-konten-count');
            if (systemCountEl) systemCountEl.textContent = konten.length;

            
            console.log('Konten loaded:', {
                total: konten.length,
                aktiv: aktivkonten.length,
                passiv: passivkonten.length,
                ertrag: ertragskonten.length,
                aufwand: aufwandskonten.length,
                steuer: steuerkonten.length
            });
            
            // Initialize icons
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        function createKontoItem(konto) {
            const typeColor = {
                'Ertrag': 'bg-green-100 text-green-800',
                'Aufwand': 'bg-red-100 text-red-800',
                'Aktiv': 'bg-blue-100 text-blue-800',
                'Passiv': 'bg-blue-100 text-blue-800',
                'Steuer': 'bg-purple-100 text-purple-800'
            };
            
            return `
                <div class="px-6 py-4 flex justify-between items-center hover:bg-gray-50">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-1">
                            <span class="bg-gray-800 text-white px-2 py-1 rounded text-sm font-semibold">${konto.nummer}</span>
                            <h4 class="font-semibold text-gray-900">${konto.name}</h4>
                        </div>
                        ${konto.beschreibung ? `<p class="text-sm text-gray-600 ml-14">${konto.beschreibung}</p>` : ''}
                        <div class="flex items-center gap-2 mt-2 ml-14">
                            <span class="px-2 py-1 rounded text-xs font-medium ${typeColor[konto.typ] || 'bg-gray-100 text-gray-800'}">
                                ${konto.typ}
                            </span>
                            <span class="text-xs text-gray-500">${konto.kategorie}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="editKonto(${konto.nummer})" class="p-2 rounded-full text-blue-600 hover:bg-blue-50" title="Konto bearbeiten" aria-label="Konto bearbeiten">
                            <i data-lucide="edit" class="h-4 w-4"></i>
                        </button>
                        <button onclick="deleteKonto(${konto.nummer})" class="p-2 rounded-full text-red-600 hover:bg-red-50" title="Konto löschen" aria-label="Konto löschen">
                            <i data-lucide="trash-2" class="h-4 w-4"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        async function editKonto(kontoNummer) {
            try {
                const konto = await app.db.get('konten', kontoNummer);
                if (!konto) {
                    showNotification('Konto nicht gefunden', 'error');
                    return;
                }
                
                // Fill form with existing data
                document.getElementById('konto-nummer').value = konto.nummer;
                document.getElementById('konto-name').value = konto.name;
                document.getElementById('konto-typ').value = konto.typ;
                document.getElementById('konto-kategorie').value = konto.kategorie;
                document.getElementById('konto-beschreibung').value = konto.beschreibung || '';
                
                // Disable nummer field for editing
                document.getElementById('konto-nummer').disabled = true;
                
                openKontoModal(kontoNummer);
            } catch (error) {
                console.error('Error loading konto for editing:', error);
                showNotification('Fehler beim Laden des Kontos', 'error');
            }
        }

        async function deleteKonto(kontoNummer) {
            try {
                const konto = await app.db.get('konten', kontoNummer);
                if (!konto) {
                    showNotification('Konto nicht gefunden', 'error');
                    return;
                }
                
                if (confirm(`Möchten Sie das Konto "${konto.nummer} - ${konto.name}" wirklich löschen?`)) {
                    await app.db.delete('konten', kontoNummer);
                    await loadKonten();
                    showNotification(`Konto "${konto.name}" wurde gelöscht`, 'success');
                }
            } catch (error) {
                console.error('Error deleting konto:', error);
                showNotification('Fehler beim Löschen des Kontos', 'error');
            }
        }

        // =====================================
        // SEARCH FUNCTIONS
        // =====================================

        // Buchung Management Functions
        async function deleteBuchung(buchungId) {
            try {
                const buchung = await app.db.get('buchungen', buchungId);
                if (!buchung) {
                    showNotification('Buchung nicht gefunden', 'error');
                    return;
                }
                
                // Bestätigung anzeigen
                const typeText = buchung.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe';
                const betragText = app.formatCurrency(buchung.betrag_brutto_cent);
                const confirmMessage = `Möchten Sie diese ${typeText} wirklich löschen?\n\n` +
                                     `Beschreibung: ${buchung.beschreibung}\n` +
                                     `Betrag: ${betragText}\n` +
                                     `Datum: ${new Date(buchung.datum).toLocaleDateString('de-DE')}\n\n` +
                                     `Diese Aktion kann nicht rückgängig gemacht werden!`;
                
                if (confirm(confirmMessage)) {
                    await app.db.delete('buchungen', buchungId);
                    
                    // Aktualisiere alle relevanten Anzeigen
                    await filterBuchungen(); // Reload filtered buchungen
                    await app.loadDashboard(); // Update KPIs
                    
                    showNotification(`${typeText} "${buchung.beschreibung}" wurde gelöscht`, 'success');
                    
                    console.log(`Buchung gelöscht: ${buchung.beschreibung} (${betragText})`);
                }
                
            } catch (error) {
                console.error('Error deleting buchung:', error);
                showNotification('Fehler beim Löschen der Buchung', 'error');
            }
        }

        // =====================================
        // MODERN BESTELLUNGEN FUNCTIONS - KOMPLETT NEU
        // =====================================

        let currentModernBestellungId = null;
        let modernBestellungenData = [];

        // Moderne IndexedDB Verwaltung
        class ModernBestellungenDB {
            constructor() {
                this.dbName = 'OptisparBestellungen';
                this.version = 1;
                this.db = null;
            }

            async init() {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(this.dbName, this.version);
                    
                    request.onerror = () => reject(request.error);
                    
                    request.onsuccess = () => {
                        this.db = request.result;
                        console.log('✅ Modern Bestellungen DB initialized');
                        resolve();
                    };
                    
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        
                        if (!db.objectStoreNames.contains('bestellungen')) {
                            const store = db.createObjectStore('bestellungen', { keyPath: 'id' });
                            store.createIndex('datum', 'datum', { unique: false });
                            store.createIndex('haendler', 'haendler', { unique: false });
                            store.createIndex('status', 'status', { unique: false });
                            console.log('✅ Bestellungen object store created');
                        }
                    };
                });
            }

            async add(data) {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['bestellungen'], 'readwrite');
                    const store = transaction.objectStore('bestellungen');
                    const request = store.add(data);
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async getAll() {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['bestellungen'], 'readonly');
                    const store = transaction.objectStore('bestellungen');
                    const request = store.getAll();
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async get(id) {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['bestellungen'], 'readonly');
                    const store = transaction.objectStore('bestellungen');
                    const request = store.get(id);
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async update(data) {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['bestellungen'], 'readwrite');
                    const store = transaction.objectStore('bestellungen');
                    const request = store.put(data);
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            async delete(id) {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['bestellungen'], 'readwrite');
                    const store = transaction.objectStore('bestellungen');
                    const request = store.delete(id);
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }
            
            async clearAll() {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['bestellungen'], 'readwrite');
                    const store = transaction.objectStore('bestellungen');
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            generateUUID() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        }

        // Global instance
        const modernBestellungenDB = new ModernBestellungenDB();

        // Initialisierung beim App-Start
        async function initModernBestellungen() {
            try {
                await modernBestellungenDB.init();
                console.log('✅ Modern Bestellungen system initialized');
            } catch (error) {
                console.error('❌ Failed to initialize Modern Bestellungen:', error);
            }
        }

        // Modal öffnen
        async function openModernBestellungModal(bestellungId = null) {
            const modal = document.getElementById('modern-bestellung-modal');
            const title = document.getElementById('modern-bestellung-modal-title');
            
            if (bestellungId) {
                currentModernBestellungId = bestellungId;
                title.innerHTML = '✏️ Bestellung bearbeiten';
                
                try {
                    const bestellung = await modernBestellungenDB.get(bestellungId);
                    if (bestellung) {
                        document.getElementById('modern-datum').value = bestellung.datum;
                        document.getElementById('modern-bezeichnung').value = bestellung.bezeichnung;
                        document.getElementById('modern-haendler').value = bestellung.haendler;
                        document.getElementById('modern-menge').value = bestellung.menge || '';
                        document.getElementById('modern-betrag').value = bestellung.betrag || '';
                        document.getElementById('modern-sendungsnummer').value = bestellung.sendungsnummer || '';
                        document.getElementById('modern-notizen').value = bestellung.notizen || '';
                    }
                } catch (error) {
                    console.error('Error loading bestellung:', error);
                    showNotification('Fehler beim Laden der Bestellung', 'error');
                }
            } else {
                currentModernBestellungId = null;
                title.innerHTML = '✨ Neue Bestellung';
                document.getElementById('modern-bestellung-form').reset();
                document.getElementById('modern-datum').value = new Date().toISOString().split('T')[0];
            }
            
            modal.classList.add('active');
        }

        // Modal schließen
        function closeModernBestellungModal() {
            document.getElementById('modern-bestellung-modal').classList.remove('active');
            document.getElementById('modern-bestellung-form').reset();
            currentModernBestellungId = null;
        }

        // Speichern
        async function saveModernBestellung(event) {
            event.preventDefault();
            
            console.log('💾 Saving modern bestellung...');
            
            try {
                // Form data sammeln
                const datum = document.getElementById('modern-datum').value;
                const bezeichnung = document.getElementById('modern-bezeichnung').value.trim();
                const haendler = document.getElementById('modern-haendler').value.trim();
                const menge = document.getElementById('modern-menge').value;
                const betrag = document.getElementById('modern-betrag').value;
                const sendungsnummer = document.getElementById('modern-sendungsnummer').value.trim();
                const notizen = document.getElementById('modern-notizen').value.trim();
                
                console.log('Form data:', { datum, bezeichnung, haendler, menge, betrag });
                
                // Validierung
                if (!bezeichnung) {
                    showNotification('🚨 Bitte Bezeichnung eingeben!', 'error');
                    return;
                }
                
                if (!haendler) {
                    showNotification('🚨 Bitte Händler eingeben!', 'error');
                    return;
                }
                
                if (!datum) {
                    showNotification('🚨 Bitte Datum auswählen!', 'error');
                    return;
                }
                
                // Daten vorbereiten
                const bestellungData = {
                    datum: datum,
                    bezeichnung: bezeichnung,
                    haendler: haendler,
                    menge: menge ? parseInt(menge) : null,
                    betrag: betrag ? parseFloat(betrag) : null,
                    sendungsnummer: sendungsnummer || '',
                    notizen: notizen || '',
                    status: {
                        rechnungMido: false,
                        rechnungMC: false,
                        rechnungRA: false,
                        rajab: false,
                        zustellung: false
                    },
                    erstelltAm: new Date().toISOString(),
                    geaendertAm: new Date().toISOString()
                };
                
                if (currentModernBestellungId) {
                    // Update
                    const existing = await modernBestellungenDB.get(currentModernBestellungId);
                    const updated = {
                        ...existing,
                        ...bestellungData,
                        id: currentModernBestellungId,
                        erstelltAm: existing.erstelltAm // Keep original creation time
                    };
                    
                    await modernBestellungenDB.update(updated);
                    console.log('✅ Bestellung updated');
                    showNotification('✅ Bestellung erfolgreich aktualisiert!', 'success');
                } else {
                    // Create new
                    const newBestellung = {
                        id: modernBestellungenDB.generateUUID(),
                        ...bestellungData
                    };
                    
                    await modernBestellungenDB.add(newBestellung);
                    console.log('✅ New bestellung created');
                    showNotification('✅ Neue Bestellung erfolgreich erstellt!', 'success');
                }

                // Refresh and close
                await loadModernBestellungen();
                closeModernBestellungModal();
                
            } catch (error) {
                console.error('❌ Error saving bestellung:', error);
                showNotification(`❌ Fehler beim Speichern: ${error.message}`, 'error');
            }
        }

        // Alle Bestellungen laden
        async function loadModernBestellungen() {
            try {
                console.log('📥 Loading modern bestellungen...');
                const bestellungen = await modernBestellungenDB.getAll();
                modernBestellungenData = bestellungen || [];
                
                console.log(`✅ Loaded ${modernBestellungenData.length} bestellungen`);
                
                displayModernBestellungen(modernBestellungenData);
                updateModernStats(modernBestellungenData);
                updateModernFilters(modernBestellungenData);
                
            } catch (error) {
                console.error('❌ Error loading bestellungen:', error);
                showNotification('❌ Fehler beim Laden der Bestellungen', 'error');
            }
        }

        // Display-Funktionen
        function displayModernBestellungen(bestellungen) {
            const container = document.getElementById('modern-bestellungen-container');
            const emptyState = document.getElementById('modern-empty-state');
            
            if (!bestellungen || bestellungen.length === 0) {
                container.innerHTML = '';
                emptyState.classList.remove('hidden');
                return;
            }
            
            emptyState.classList.add('hidden');
            
            container.innerHTML = bestellungen.map(bestellung => {
                const statusCount = Object.values(bestellung.status || {}).filter(Boolean).length;
                const totalStatus = 5;
                const isCompleted = statusCount === totalStatus;
                
                return `
                    <div class="bestellung-card">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-lg font-semibold text-gray-900 mb-1">${bestellung.bezeichnung}</h3>
                                <p class="text-sm text-gray-500">📅 ${new Date(bestellung.datum).toLocaleDateString('de-DE')}</p>
                            </div>
                            <div class="text-right">
                                ${bestellung.betrag ? `<p class="text-lg font-bold text-green-600">${bestellung.betrag.toFixed(2)} €</p>` : ''}
                                <p class="text-xs text-gray-500">${bestellung.menge ? bestellung.menge + ' Stk.' : ''}</p>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <p class="text-sm text-gray-600 mb-2">🏪 <strong>${bestellung.haendler}</strong></p>
                            ${bestellung.sendungsnummer ? `<p class="text-sm text-gray-600">📦 ${bestellung.sendungsnummer}</p>` : ''}
                            ${bestellung.notizen ? `<p class="text-sm text-gray-500 italic mt-2">"${bestellung.notizen}"</p>` : ''}
                        </div>
                        
                        <div class="mb-4">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-sm font-medium text-gray-700">Status Progress</span>
                                <span class="text-sm ${isCompleted ? 'text-green-600 font-semibold' : 'text-gray-500'}">${statusCount}/${totalStatus}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2 mb-3">
                                <div class="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500" style="width: ${(statusCount / totalStatus * 100)}%"></div>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                <span class="status-badge ${bestellung.status?.rechnungMido ? 'completed' : 'pending'}" onclick="modernToggleStatus('${bestellung.id}', 'rechnungMido')">
                                    ${bestellung.status?.rechnungMido ? '✅' : '⏳'} Rechnung Mido
                                </span>
                                <span class="status-badge ${bestellung.status?.rechnungMC ? 'completed' : 'pending'}" onclick="modernToggleStatus('${bestellung.id}', 'rechnungMC')">
                                    ${bestellung.status?.rechnungMC ? '✅' : '⏳'} Rechnung MC
                                </span>
                                <span class="status-badge ${bestellung.status?.rechnungRA ? 'completed' : 'pending'}" onclick="modernToggleStatus('${bestellung.id}', 'rechnungRA')">
                                    ${bestellung.status?.rechnungRA ? '✅' : '⏳'} Rechnung RA
                                </span>
                                <span class="status-badge ${bestellung.status?.rajab ? 'completed' : 'pending'}" onclick="modernToggleStatus('${bestellung.id}', 'rajab')">
                                    ${bestellung.status?.rajab ? '✅' : '⏳'} Rajab
                                </span>
                                <span class="status-badge ${bestellung.status?.zustellung ? 'completed' : 'pending'}" onclick="modernToggleStatus('${bestellung.id}', 'zustellung')">
                                    ${bestellung.status?.zustellung ? '✅' : '⏳'} Zustellung
                                </span>
                            </div>
                        </div>
                        
                        <div class="card-actions">
                            <button class="card-action-btn edit" onclick="openModernBestellungModal('${bestellung.id}')">
                                <i data-lucide="edit" class="h-4 w-4"></i>
                                Bearbeiten
                            </button>
                            <button class="card-action-btn delete" onclick="modernDeleteBestellung('${bestellung.id}')">
                                <i data-lucide="trash-2" class="h-4 w-4"></i>
                                Löschen
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Icons aktualisieren
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        // Statistiken aktualisieren
        function updateModernStats(bestellungen) {
            const total = bestellungen.length;
            const offen = bestellungen.filter(b => {
                const status = b.status || {};
                return !status.rechnungMido || !status.rechnungMC || !status.rechnungRA || !status.rajab || !status.zustellung;
            }).length;
            const erledigt = total - offen;
            const gesamtwert = bestellungen.reduce((sum, b) => sum + (b.betrag || 0), 0);
            
            document.getElementById('bestellungen-total').textContent = total;
            document.getElementById('bestellungen-offen').textContent = offen;
            document.getElementById('bestellungen-erledigt').textContent = erledigt;
            document.getElementById('bestellungen-wert').textContent = gesamtwert.toFixed(2) + ' €';
        }

        // Filter aktualisieren
        function updateModernFilters(bestellungen) {
            const haendlerFilter = document.getElementById('modern-haendler-filter');
            const currentValue = haendlerFilter.value;
            
            const uniqueHaendler = [...new Set(bestellungen.map(b => b.haendler))].sort();
            
            haendlerFilter.innerHTML = '<option value="alle">🏪 Alle Händler</option>';
            uniqueHaendler.forEach(h => {
                const option = document.createElement('option');
                option.value = h;
                option.textContent = h;
                haendlerFilter.appendChild(option);
            });
            
            haendlerFilter.value = currentValue;
        }

        // Status Toggle
        async function modernToggleStatus(bestellungId, statusType) {
            try {
                const bestellung = await modernBestellungenDB.get(bestellungId);
                if (!bestellung) return;
                
                const currentStatus = bestellung.status?.[statusType] || false;
                
                if (currentStatus) {
                    const confirm = window.confirm('🤔 Bist du sicher, dass das grüne Label entfernt werden soll?');
                    if (!confirm) return;
                }
                
                if (!bestellung.status) bestellung.status = {};
                bestellung.status[statusType] = !currentStatus;
                bestellung.geaendertAm = new Date().toISOString();
                
                await modernBestellungenDB.update(bestellung);
                
                const statusNames = {
                    'rechnungMido': 'Rechnung Mido',
                    'rechnungMC': 'Rechnung MC',
                    'rechnungRA': 'Rechnung RA',
                    'rajab': 'Rajab',
                    'zustellung': 'Zustellung'
                };
                
                const message = bestellung.status[statusType] ? 
                    `✅ ${statusNames[statusType]} als erledigt markiert!` : 
                    `⏳ ${statusNames[statusType]} Status entfernt`;
                showNotification(message, 'success');
                
                await loadModernBestellungen();
                
            } catch (error) {
                console.error('Error toggling status:', error);
                showNotification('❌ Fehler beim Aktualisieren des Status', 'error');
            }
        }

        // Bestellung löschen
        async function modernDeleteBestellung(bestellungId) {
            try {
                const bestellung = await modernBestellungenDB.get(bestellungId);
                if (!bestellung) return;
                
                const confirm = window.confirm(`🗑️ Möchten Sie die Bestellung "${bestellung.bezeichnung}" wirklich löschen?`);
                if (!confirm) return;
                
                await modernBestellungenDB.delete(bestellungId);
                showNotification('🗑️ Bestellung wurde gelöscht', 'success');
                await loadModernBestellungen();
                
            } catch (error) {
                console.error('Error deleting bestellung:', error);
                showNotification('❌ Fehler beim Löschen der Bestellung', 'error');
            }
        }

        // Filter-Funktionen
        async function modernFilterBestellungen() {
            const statusFilter = document.getElementById('modern-status-filter').value;
            const haendlerFilter = document.getElementById('modern-haendler-filter').value;
            const suche = document.getElementById('modern-suche').value.toLowerCase();
            
            let filtered = [...modernBestellungenData];
            
            // Status Filter
            if (statusFilter === 'offen') {
                filtered = filtered.filter(b => {
                    const status = b.status || {};
                    return !status.rechnungMido || !status.rechnungMC || !status.rechnungRA || !status.rajab || !status.zustellung;
                });
            } else if (statusFilter === 'abgeschlossen') {
                filtered = filtered.filter(b => {
                    const status = b.status || {};
                    return status.rechnungMido && status.rechnungMC && status.rechnungRA && status.rajab && status.zustellung;
                });
            }
            
            // Händler Filter
            if (haendlerFilter !== 'alle') {
                filtered = filtered.filter(b => b.haendler === haendlerFilter);
            }
            
            // Suchfilter
            if (suche) {
                filtered = filtered.filter(b => 
                    b.bezeichnung.toLowerCase().includes(suche) ||
                    (b.sendungsnummer && b.sendungsnummer.toLowerCase().includes(suche)) ||
                    b.haendler.toLowerCase().includes(suche)
                );
            }
            
            displayModernBestellungen(filtered);
            updateModernStats(filtered);
        }

        // Filter zurücksetzen
        function modernClearFilters() {
            document.getElementById('modern-status-filter').value = 'alle';
            document.getElementById('modern-haendler-filter').value = 'alle';
            document.getElementById('modern-suche').value = '';
            displayModernBestellungen(modernBestellungenData);
            updateModernStats(modernBestellungenData);
        }

        // Buchungen Filter Functions
        function toggleBuchungenDateRange() {
            const period = document.getElementById('buchungen-zeitraum-filter').value;
            const customRange = document.getElementById('buchungen-custom-date-range');
            
            if (period === 'custom') {
                customRange.classList.remove('hidden');
                // Set default dates
                const today = new Date();
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                document.getElementById('buchungen-date-from').value = firstDay.toISOString().split('T')[0];
                document.getElementById('buchungen-date-to').value = today.toISOString().split('T')[0];
            } else {
                customRange.classList.add('hidden');
            }
        }

        function getBuchungenDateRange() {
            const period = document.getElementById('buchungen-zeitraum-filter').value;
            const today = new Date();
            let fromDate, toDate;

            switch(period) {
                case 'heute':
                    fromDate = toDate = today;
                    break;
                case 'diese-woche':
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());
                    fromDate = weekStart;
                    toDate = today;
                    break;
                case 'dieser-monat':
                    fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    toDate = today;
                    break;
                case 'dieses-jahr':
                    fromDate = new Date(today.getFullYear(), 0, 1);
                    toDate = today;
                    break;
                case 'custom':
                    fromDate = new Date(document.getElementById('buchungen-date-from').value);
                    toDate = new Date(document.getElementById('buchungen-date-to').value);
                    break;
                default:
                    fromDate = null;
                    toDate = null;
            }

            return { fromDate, toDate };
        }

        async function filterBuchungen() {
            try {
                const allBuchungen = await app.db.getAll('buchungen');
                let filteredBuchungen = [...allBuchungen];
                
                // Search filter
                const searchTerm = document.getElementById('buchungen-search').value.toLowerCase();
                if (searchTerm) {
                    filteredBuchungen = filteredBuchungen.filter(buchung => 
                        buchung.beschreibung.toLowerCase().includes(searchTerm) ||
                        buchung.account?.toLowerCase().includes(searchTerm) ||
                        app.formatCurrency(buchung.betrag_brutto_cent).toLowerCase().includes(searchTerm) ||
                        buchung.kategorie?.toLowerCase().includes(searchTerm)
                    );
                }
                
                // Type filter
                const typFilter = document.getElementById('buchungen-typ-filter').value;
                if (typFilter !== 'alle') {
                    filteredBuchungen = filteredBuchungen.filter(buchung => 
                        buchung.typ === typFilter
                    );
                }
                
                // Account filter
                const kontoFilter = document.getElementById('buchungen-konto-filter').value;
                if (kontoFilter !== 'alle') {
                    filteredBuchungen = filteredBuchungen.filter(buchung => 
                        buchung.account === kontoFilter
                    );
                }
                
                // Date range filter
                const { fromDate, toDate } = getBuchungenDateRange();
                if (fromDate && toDate) {
                    filteredBuchungen = filteredBuchungen.filter(buchung => {
                        const buchungDate = new Date(buchung.datum);
                        return buchungDate >= fromDate && buchungDate <= toDate;
                    });
                }
                
                // Sort by date (newest first)
                filteredBuchungen.sort((a, b) => new Date(b.datum) - new Date(a.datum));
                
                app.displayBuchungen(filteredBuchungen);
                
            } catch (error) {
                console.error('Error filtering buchungen:', error);
                showNotification('Fehler beim Filtern der Buchungen', 'error');
            }
        }

        function resetBuchungenFilter() {
            document.getElementById('buchungen-search').value = '';
            document.getElementById('buchungen-typ-filter').value = 'alle';
            document.getElementById('buchungen-konto-filter').value = 'alle';
            document.getElementById('buchungen-zeitraum-filter').value = 'alle';
            document.getElementById('buchungen-custom-date-range').classList.add('hidden');
            document.getElementById('buchungen-date-from').value = '';
            document.getElementById('buchungen-date-to').value = '';
            
            filterBuchungen();
        }

        async function filterWaren() {
            const query = document.getElementById('waren-search').value.toLowerCase().trim();
            const waren = await app.db.getAll('waren');
            
            if (query === '') {
                app.displayWaren(waren);
                return;
            }
            
            const filtered = waren.filter(ware => {
                return ware.name.toLowerCase().includes(query) ||
                       (ware.kategorie && ware.kategorie.toLowerCase().includes(query)) ||
                       (ware.artikelnummer && ware.artikelnummer.toLowerCase().includes(query)) ||
                       (ware.beschreibung && ware.beschreibung.toLowerCase().includes(query)) ||
                       (ware.lieferant && ware.lieferant.toLowerCase().includes(query));
            });
            
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            app.displayWaren(filtered);
        }

        // =====================================
        // TAB NAVIGATION
        // =====================================

        // DIREKTE LAGER-NAVIGATION (garantiert funktionierend)
        function forceShowLager() {
            console.log('🔧 FORCE LAGER NAVIGATION');
            
            // Check if app is ready
            if (!app) {
                console.warn('App not ready for lager navigation');
                setTimeout(forceShowLager, 500); // Retry after 500ms
                return;
            }
            
            try {
                // Verstecke Dashboard
                const dashboard = document.getElementById('content-dashboard');
                if (dashboard) {
                    dashboard.style.display = 'none';
                    dashboard.classList.remove('active');
                    console.log('✅ Dashboard hidden');
                }
                
                // Verstecke alle anderen Tabs
                const allContents = ['content-buchungen', 'content-bewegungen', 'content-konten', 'content-berichte', 'content-bestellungen', 'content-admin'];                allContents.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.style.display = 'none';
                        element.classList.remove('active');
                    }
                });
                
                // Zeige Lager Tab
                const lager = document.getElementById('content-lager');
                if (lager) {
                    lager.style.display = 'block';
                    lager.classList.add('active');
                    console.log('✅ Lager shown');
                } else {
                    console.error('❌ Lager element not found');
                    return;
                }
                
                // Tab-Button stylen
                document.querySelectorAll('.tab-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                const lagerTab = document.getElementById('tab-lager');
                if (lagerTab) {
                    lagerTab.classList.add('active');
                    console.log('✅ Lager tab button activated');
                }
                
                // Lade Produkte wenn App verfügbar
                if (app && app.loadWaren) {
                    console.log('🔄 Loading products...');
                    app.loadWaren().then(() => {
                        console.log('✅ Products loaded');
                        
                        // Laden vorhandener Produkte
                        app.db.getAll('waren').then(waren => {
                            if (waren.length === 0) {
                                                                console.log('⚠️ No products found in database.');
                            } else {
                                console.log(`✅ Found ${waren.length} existing products`);
                            }
                        });
                    }).catch(error => {
                        console.error('❌ Error loading products:', error);
                    });
                }
                
                // Refresh icons
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
                
                console.log('🎉 Force lager navigation completed');
            } catch (error) {
                console.error('Error in forceShowLager:', error);
            }
        }

        // =====================================
        // DATA EXPORT/IMPORT
        // =====================================

        async function exportData() {
            // Use the new enhanced export function with folder structure
            await exportDataWithStructure();
        }

        function importData() {
            document.getElementById('import-file-input').click();
        }

        async function handleFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (!(data.version || data.exportInfo || data.backupInfo)) {
                    throw new Error('Ungültiges Backup-Format');
                }
                
                await importOptisparData(data);
                
                showNotification('Daten wurden erfolgreich importiert', 'success');
                event.target.value = '';
            } catch (error) {
                console.error('Import error:', error);
                showNotification('Fehler beim Importieren: ' + error.message, 'error');
                event.target.value = '';
            }
        }

        // Excel Report Functions
        function toggleCustomDateRange() {
            const period = document.getElementById('time-period').value;
            const customRange = document.getElementById('custom-date-range');
            
            if (period === 'custom') {
                customRange.classList.remove('hidden');
                // Set default dates
                const today = new Date();
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                document.getElementById('date-from').value = firstDay.toISOString().split('T')[0];
                document.getElementById('date-to').value = today.toISOString().split('T')[0];
            } else {
                customRange.classList.add('hidden');
            }
        }

        function getDateRange() {
            const period = document.getElementById('time-period').value;
            const today = new Date();
            let fromDate, toDate;

            switch(period) {
                case 'heute':
                    fromDate = toDate = today;
                    break;
                case 'diese-woche':
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());
                    fromDate = weekStart;
                    toDate = today;
                    break;
                case 'dieser-monat':
                    fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    toDate = today;
                    break;
                case 'dieses-jahr':
                    fromDate = new Date(today.getFullYear(), 0, 1);
                    toDate = today;
                    break;
                case 'custom':
                    fromDate = new Date(document.getElementById('date-from').value);
                    toDate = new Date(document.getElementById('date-to').value);
                    break;
                default:
                    fromDate = null;
                    toDate = null;
            }

            return { fromDate, toDate };
        }

        function filterDataByDate(data, fromDate, toDate) {
            if (!fromDate || !toDate) return data;
            
            return data.filter(item => {
                const itemDate = new Date(item.date || item.timestamp);
                return itemDate >= fromDate && itemDate <= toDate;
            });
        }

        async function generateExcelReport() {
            try {
                const reportType = document.getElementById('report-type').value;
                const { fromDate, toDate } = getDateRange();
                
                // Get data
                const buchungen = await app.db.getAll('buchungen');
                const products = await app.db.getAll('waren');
                
                // Filter by date range
                const filteredBuchungen = filterDataByDate(buchungen, fromDate, toDate);
                
                // Create workbook with professional styling
                const wb = XLSX.utils.book_new();
                wb.Props = {
                    Title: "Optispar Finanz- und Lagerbericht",
                    Subject: "Professioneller Geschäftsbericht",
                    Author: "Optispar Buchhaltungssystem",
                    CreatedDate: new Date()
                };
                
                // Sheet 1: Executive Dashboard
                const dashboardData = createExecutiveDashboard(filteredBuchungen, products, reportType, fromDate, toDate);
                const wsDashboard = XLSX.utils.aoa_to_sheet(dashboardData);
                
                // Apply professional styling to dashboard
                applyDashboardStyling(wsDashboard);
                
                XLSX.utils.book_append_sheet(wb, wsDashboard, "📊 Executive Dashboard");
                
                // Sheet 2: Gesamtübersicht (existing data, enhanced)
                const overviewData = createEnhancedOverviewSheet(filteredBuchungen, products, reportType);
                const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
                
                // Apply professional styling
                applyOverviewStyling(wsOverview);
                
                XLSX.utils.book_append_sheet(wb, wsOverview, "📋 Gesamtübersicht");
                
                // Sheet 3: Zusammenfassung (existing, enhanced with charts data)
                const summaryData = createEnhancedSummarySheet(filteredBuchungen, products, reportType);
                const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
                
                // Apply summary styling
                applySummaryStyling(wsSummary);
                
                XLSX.utils.book_append_sheet(wb, wsSummary, "📈 Zusammenfassung & Analysen");
                
                // Sheet 4: Charts & Visualizations Data
                if (reportType === 'vollstaendig' || reportType === 'gewinn-verlust') {
                    const chartsData = createChartsDataSheet(filteredBuchungen, products);
                    const wsCharts = XLSX.utils.aoa_to_sheet(chartsData);
                    
                    applyChartsStyling(wsCharts);
                    
                    XLSX.utils.book_append_sheet(wb, wsCharts, "📊 Diagramm-Daten");
                }
                
                // Generate filename with timestamp
                const dateStr = fromDate && toDate ? 
                    `${fromDate.toISOString().split('T')[0]}_bis_${toDate.toISOString().split('T')[0]}` : 
                    'Gesamt';
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `Optispar_Professional_${reportType}_${dateStr}_${timestamp}.xlsx`;
                
                // Download file with fallback method
                try {
                    // Try XLSX.writeFile first
                    XLSX.writeFile(wb, filename);
                    showNotification('Professioneller Excel-Bericht mit Diagrammen erstellt!', 'success');
                } catch (writeError) {
                    console.warn('XLSX.writeFile failed, trying fallback method:', writeError);
                    
                    // Fallback: Create blob and trigger download manually
                    try {
                        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                        
                        // Create download link
                        const downloadLink = document.createElement('a');
                        const url = window.URL.createObjectURL(blob);
                        downloadLink.href = url;
                        downloadLink.download = filename;
                        
                        // Trigger download
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                        
                        // Clean up URL object
                        setTimeout(() => window.URL.revokeObjectURL(url), 100);
                        
                        showNotification('Professioneller Excel-Bericht mit Diagrammen erstellt! (Fallback-Methode)', 'success');
                    } catch (fallbackError) {
                        console.error('Both download methods failed:', fallbackError);
                        throw fallbackError;
                    }
                }
                
                // Log report generation
                console.log('Professional Excel report generated:', {
                    filename,
                    reportType,
                    dateRange: `${fromDate?.toISOString().split('T')[0]} bis ${toDate?.toISOString().split('T')[0]}`,
                    buchungenCount: filteredBuchungen.length,
                    productsCount: products.length,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('Excel generation error:', error);
                showNotification('Fehler beim Generieren des professionellen Berichts!', 'error');
            }
        }

        function createExecutiveDashboard(buchungen, products, reportType, fromDate, toDate) {
            let data = [];
            
            // Professional Header
            data.push(['OPTISPAR EXECUTIVE DASHBOARD']);
            data.push(['Intelligente Buchhaltung & Lagerverwaltung']);
            data.push([]);
            data.push(['Berichtszeitraum:', fromDate && toDate ? 
                `${fromDate.toLocaleDateString('de-DE')} - ${toDate.toLocaleDateString('de-DE')}` : 'Gesamter Zeitraum']);
            data.push(['Generiert am:', new Date().toLocaleDateString('de-DE', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            })]);
            data.push(['Berichtstyp:', reportType.toUpperCase()]);
            data.push([]);
            
            // Key Performance Indicators
            data.push(['🎯 KEY PERFORMANCE INDICATORS (KPIs)']);
            data.push([]);
            
            // Calculate financial KPIs
            let totalEinnahmen = 0, totalAusgaben = 0;
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            let einnahmenMonat = 0, ausgabenMonat = 0;
            
            buchungen.forEach(buchung => {
                const amount = parseFloat(buchung.amount);
                const buchungDate = new Date(buchung.date);
                
                if (buchung.type === 'einnahme') {
                    totalEinnahmen += amount;
                    if (buchungDate.getMonth() === currentMonth && buchungDate.getFullYear() === currentYear) {
                        einnahmenMonat += amount;
                    }
                } else {
                    totalAusgaben += amount;
                    if (buchungDate.getMonth() === currentMonth && buchungDate.getFullYear() === currentYear) {
                        ausgabenMonat += amount;
                    }
                }
            });
            
            const gewinn = totalEinnahmen - totalAusgaben;
            const gewinnMonat = einnahmenMonat - ausgabenMonat;
            const gewinnmarge = totalEinnahmen > 0 ? (gewinn / totalEinnahmen * 100) : 0;
            
            // Financial KPIs Table
            data.push(['FINANZ-KPIs', 'Gesamtperiode', 'Aktueller Monat', 'Trend']);
            data.push(['Umsatz (€)', totalEinnahmen.toFixed(2), einnahmenMonat.toFixed(2), einnahmenMonat > 0 ? '↗️ Positiv' : '➡️ Neutral']);
            data.push(['Kosten (€)', totalAusgaben.toFixed(2), ausgabenMonat.toFixed(2), ausgabenMonat > 0 ? '↗️ Vorhanden' : '➡️ Neutral']);
            data.push(['Gewinn (€)', gewinn.toFixed(2), gewinnMonat.toFixed(2), gewinn > 0 ? '✅ Positiv' : gewinn < 0 ? '❌ Verlust' : '➡️ Break-Even']);
            data.push(['Gewinnmarge (%)', gewinnmarge.toFixed(1) + '%', '', gewinnmarge > 20 ? '🟢 Sehr gut' : gewinnmarge > 10 ? '🟡 Gut' : '🔴 Verbesserungsbedarf']);
            data.push([]);
            
            // Inventory KPIs
            let gesamtlagerwert = 0;
            let gesamtbestand = 0;
            let niedrigeBestaende = 0;
            
            products.forEach(product => {
                const stock = parseInt(product.bestand) || 0;
                const price = parseFloat(product.price) || 0;
                const minStock = parseInt(product.minStock) || 0;
                
                gesamtlagerwert += stock * price;
                gesamtbestand += stock;
                
                if (stock <= minStock) {
                    niedrigeBestaende++;
                }
            });
            
            data.push(['LAGER-KPIs', 'Wert', 'Status', 'Empfehlung']);
            data.push(['Gesamtlagerwert (€)', gesamtlagerwert.toFixed(2), 
                gesamtlagerwert > 10000 ? '🟢 Hoch' : gesamtlagerwert > 5000 ? '🟡 Mittel' : '🟠 Niedrig',
                gesamtlagerwert < 5000 ? 'Lagerbestand prüfen' : 'Optimal']);
            data.push(['Produktarten', products.length, 
                products.length > 50 ? '🟢 Vielfältig' : products.length > 20 ? '🟡 Gut' : '🟠 Begrenzt',
                products.length < 20 ? 'Portfolio erweitern' : 'Sortiment verwalten']);
            data.push(['Gesamtbestand (Stk.)', gesamtbestand, '', '']);
            data.push(['Niedrige Bestände', niedrigeBestaende, 
                niedrigeBestaende === 0 ? '✅ Keine' : niedrigeBestaende < 5 ? '🟡 Wenige' : '🔴 Viele',
                niedrigeBestaende > 0 ? 'Nachbestellung prüfen' : 'Bestandsmanagement optimal']);
            data.push([]);
            
            // Business Health Score
            const healthScore = calculateBusinessHealthScore(gewinnmarge, gesamtlagerwert, niedrigeBestaende, products.length);
            data.push(['📊 BUSINESS HEALTH SCORE']);
            data.push(['Gesamtbewertung:', `${healthScore}/100 Punkte`, getHealthScoreDescription(healthScore)]);
            data.push([]);
            
            // Recommendations
            data.push(['💡 STRATEGISCHE EMPFEHLUNGEN']);
            const recommendations = generateBusinessRecommendations(gewinnmarge, gesamtlagerwert, niedrigeBestaende, buchungen.length);
            recommendations.forEach(rec => data.push([rec]));
            
            return data;
        }

        function calculateBusinessHealthScore(gewinnmarge, lagerwert, niedrigeBestaende, produktarten) {
            let score = 0;
            
            // Profitability (40 points)
            if (gewinnmarge > 20) score += 40;
            else if (gewinnmarge > 10) score += 30;
            else if (gewinnmarge > 0) score += 20;
            else score += 0;
            
            // Inventory Management (30 points)
            if (lagerwert > 10000) score += 30;
            else if (lagerwert > 5000) score += 20;
            else score += 10;
            
            // Stock Management (20 points)
            if (niedrigeBestaende === 0) score += 20;
            else if (niedrigeBestaende < 5) score += 15;
            else score += 5;
            
            // Product Diversity (10 points)
            if (produktarten > 50) score += 10;
            else if (produktarten > 20) score += 7;
            else score += 3;
            
            return Math.min(100, score);
        }

        function getHealthScoreDescription(score) {
            if (score >= 90) return '🏆 Exzellent - Unternehmen läuft sehr gut';
            if (score >= 75) return '✅ Sehr gut - Solide Performance';
            if (score >= 60) return '👍 Gut - Einige Verbesserungen möglich';
            if (score >= 40) return '⚠️ Befriedigend - Optimierungsbedarf';
            return '🚨 Kritisch - Dringende Maßnahmen erforderlich';
        }

        function generateBusinessRecommendations(gewinnmarge, lagerwert, niedrigeBestaende, buchungenCount) {
            const recommendations = [];
            
            if (gewinnmarge < 10) {
                recommendations.push('📈 Gewinnmarge verbessern: Preise überprüfen oder Kosten senken');
            }
            
            if (lagerwert < 5000) {
                recommendations.push('📦 Lagerbestand erweitern: Mehr Produkte für bessere Umsätze');
            }
            
            if (niedrigeBestaende > 0) {
                recommendations.push('🔄 Nachbestellungen durchführen: ' + niedrigeBestaende + ' Artikel unter Mindestbestand');
            }
            
            if (buchungenCount < 10) {
                recommendations.push('📊 Buchungsaktivität steigern: Mehr Transaktionen für bessere Analyse');
            }
            
            if (recommendations.length === 0) {
                recommendations.push('🎉 Glückwunsch! Ihr Unternehmen läuft optimal.');
                recommendations.push('🚀 Fokus auf Wachstum: Neue Märkte oder Produkte erschließen');
            }
            
            return recommendations;
        }

        function createEnhancedOverviewSheet(buchungen, products, reportType) {
            let data = [];
            
            // Enhanced Header with professional styling
            data.push(['OPTISPAR - DETAILLIERTE GESAMTÜBERSICHT']);
            data.push(['Vollständige Transaktions- und Inventar-Analyse']);
            data.push(['Generiert am:', new Date().toLocaleDateString('de-DE')]);
            data.push(['Berichtstyp:', reportType]);
            data.push([]); // Empty row
            
            if (reportType === 'vollstaendig' || reportType === 'buchungen') {
                // Enhanced Buchungen Section
                data.push(['💰 BUCHUNGEN & TRANSAKTIONEN']);
                data.push(['Datum', 'Beschreibung', 'Typ', 'Kategorie', 'Konto', 'Netto (€)', 'MwSt (€)', 'Brutto (€)', 'Status', 'Trend']);
                
                buchungen.sort((a, b) => new Date(b.date) - new Date(a.date));
                buchungen.forEach((buchung, index) => {
                    const typeEmoji = buchung.type === 'einnahme' ? '💚' : '💸';
                    const trend = index === 0 ? '📊 Neueste' : 
                                 buchung.type === 'einnahme' ? '📈 Umsatz' : '📉 Ausgabe';
                    
                    data.push([
                        new Date(buchung.date).toLocaleDateString('de-DE'),
                        buchung.description,
                        typeEmoji + ' ' + (buchung.type === 'einnahme' ? 'Einnahme' : 'Ausgabe'),
                        buchung.category || 'Keine Kategorie',
                        buchung.account ? buchung.account + ' - ' + getAccountName(buchung.account) : 'Kein Konto',
                        (parseFloat(buchung.amount) * 0.84).toFixed(2), // Estimated net
                        (parseFloat(buchung.amount) * 0.16).toFixed(2), // Estimated VAT
                        parseFloat(buchung.amount).toFixed(2),
                        '✅ Abgeschlossen',
                        trend
                    ]);
                });
                data.push([]); // Empty row
            }
            
            if (reportType === 'vollstaendig' || reportType === 'lager') {
                // Enhanced Lager Section
                data.push(['📦 LAGER & INVENTAR MANAGEMENT']);
                data.push(['Produktname', 'SKU', 'Kategorie', 'Lieferant', 'Netto (€)', 'Brutto (€)', 'Bestand', 'Min. Bestand', 'Lagerwert (€)', 'Status', 'Aktion erforderlich']);
                
                products.forEach(product => {
                    const stock = parseInt(product.bestand) || 0;
                    const minStock = parseInt(product.minStock) || 0;
                    const lagerwert = (parseFloat(product.price) * stock).toFixed(2);
                    
                    let status, action;
                    if (stock === 0) {
                        status = '🔴 Ausverkauft';
                        action = '🚨 Sofort nachbestellen';
                    } else if (stock <= minStock) {
                        status = '🟡 Niedriger Bestand';
                        action = '⚠️ Nachbestellung prüfen';
                    } else if (stock > minStock * 3) {
                        status = '🟢 Gut bevorratet';
                        action = '📊 Bestand optimieren';
                    } else {
                        status = '✅ Normal';
                        action = '👍 Kein Handlungsbedarf';
                    }
                    
                    data.push([
                        product.name,
                        product.sku || 'N/A',
                        product.category,
                        product.supplier || 'Nicht angegeben',
                        parseFloat(product.price).toFixed(2),
                        parseFloat(product.priceGross).toFixed(2),
                        stock,
                        minStock,
                        lagerwert,
                        status,
                        action
                    ]);
                });
            }
            
            return data;
        }

        function createEnhancedSummarySheet(buchungen, products, reportType) {
            let data = [];
            
            // Enhanced Header
            data.push(['OPTISPAR - BUSINESS INTELLIGENCE & ZUSAMMENFASSUNG']);
            data.push(['Strategische Analysen und Key Performance Indicators']);
            data.push(['Generiert am:', new Date().toLocaleDateString('de-DE')]);
            data.push([]);
            
            // Financial Analysis
            if (reportType === 'vollstaendig' || reportType === 'buchungen' || reportType === 'gewinn-verlust') {
                data.push(['📊 FINANZANALYSE']);
                
                const currentMonth = new Date().getMonth();
                const currentYear = new Date().getFullYear();
                
                let umsatzMonat = 0, umsatzJahr = 0, kostenMonat = 0, kostenJahr = 0;
                const monthlyData = {};
                
                buchungen.forEach(buchung => {
                    // Ensure valid date format
                    const dateStr = buchung.date || buchung.datum || new Date().toISOString().split('T')[0];
                    const buchungDate = new Date(dateStr);
                    
                    // Check if date is valid
                    if (isNaN(buchungDate.getTime())) {
                        return; // Skip invalid dates
                    }
                    
                    const amount = parseFloat(buchung.betrag || buchung.amount || 0);
                    const monthKey = buchungDate.toISOString().substr(0, 7); // YYYY-MM
                    
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = { einnahmen: 0, ausgaben: 0 };
                    }
                    
                    if (buchungDate.getFullYear() === currentYear) {
                        if (buchung.type === 'einnahme') {
                            umsatzJahr += amount;
                            monthlyData[monthKey].einnahmen += amount;
                            if (buchungDate.getMonth() === currentMonth) {
                                umsatzMonat += amount;
                            }
                        } else if (buchung.type === 'ausgabe') {
                            kostenJahr += amount;
                            monthlyData[monthKey].ausgaben += amount;
                            if (buchungDate.getMonth() === currentMonth) {
                                kostenMonat += amount;
                            }
                        }
                    }
                });
                
                const gewinnMonat = umsatzMonat - kostenMonat;
                const gewinnJahr = umsatzJahr - kostenJahr;
                const roi = umsatzJahr > 0 ? ((gewinnJahr / kostenJahr) * 100) : 0;
                
                data.push(['FINANZ-KPIs', 'Aktueller Monat (€)', 'Aktuelles Jahr (€)', 'Entwicklung']);
                data.push(['💰 Umsatz', umsatzMonat.toFixed(2), umsatzJahr.toFixed(2), umsatzMonat > umsatzJahr/12 ? '📈 Über Durchschnitt' : '📉 Unter Durchschnitt']);
                data.push(['💸 Kosten', kostenMonat.toFixed(2), kostenJahr.toFixed(2), kostenMonat < kostenJahr/12 ? '✅ Unter Kontrolle' : '⚠️ Erhöht']);
                data.push(['💎 Gewinn', gewinnMonat.toFixed(2), gewinnJahr.toFixed(2), gewinnJahr > 0 ? '✅ Profitabel' : '❌ Verlust']);
                data.push(['📊 ROI (%)', '', roi.toFixed(1) + '%', roi > 15 ? '🟢 Sehr gut' : roi > 5 ? '🟡 Akzeptabel' : '🔴 Niedrig']);
                data.push([]);
                
                // Monthly Trend Analysis
                data.push(['📈 MONATLICHE ENTWICKLUNG']);
                data.push(['Monat', 'Einnahmen (€)', 'Ausgaben (€)', 'Gewinn (€)', 'Trend']);
                
                Object.entries(monthlyData)
                    .sort()
                    .forEach(([month, monthData]) => {
                        const gewinn = monthData.einnahmen - monthData.ausgaben;
                        const trend = gewinn > 0 ?
                            (gewinn > 1000 ? '🚀 Sehr gut' : '✅ Positiv') :
                            (gewinn < -1000 ? '🚨 Kritisch' : '⚠️ Verlust');

                        data.push([
                            new Date(month + '-01').toLocaleDateString('de-DE', { year: 'numeric', month: 'long' }),
                            monthData.einnahmen.toFixed(2),
                            monthData.ausgaben.toFixed(2),
                            gewinn.toFixed(2),
                            trend
                        ]);
                    });
                data.push([]);
                
                // Category Analysis
                data.push(['🏷️ KATEGORIE-ANALYSE']);
                const kategorien = {};
                buchungen.forEach(buchung => {
                    const kategorie = buchung.category || 'Nicht kategorisiert';
                    if (!kategorien[kategorie]) {
                        kategorien[kategorie] = { einnahmen: 0, ausgaben: 0, count: 0 };
                    }
                    kategorien[kategorie].count++;
                    if (buchung.type === 'einnahme') {
                        kategorien[kategorie].einnahmen += parseFloat(buchung.amount);
                    } else {
                        kategorien[kategorie].ausgaben += parseFloat(buchung.amount);
                    }
                });
                
                data.push(['Kategorie', 'Einnahmen (€)', 'Ausgaben (€)', 'Netto (€)', 'Anzahl', 'Performance']);
                Object.entries(kategorien).forEach(([kategorie, values]) => {
                    const netto = values.einnahmen - values.ausgaben;
                    const performance = netto > 0 ? 
                        (netto > 1000 ? '⭐ Top-Kategorie' : '✅ Profitabel') : 
                        '📉 Kostenstelle';
                    
                    data.push([
                        kategorie,
                        values.einnahmen.toFixed(2),
                        values.ausgaben.toFixed(2),
                        netto.toFixed(2),
                        values.count,
                        performance
                    ]);
                });
                data.push([]);
            }
            
            // Enhanced Inventory Analysis
            if (reportType === 'vollstaendig' || reportType === 'lager') {
                data.push(['📦 LAGER-INTELLIGENCE']);
                
                let gesamtlagerwert = 0;
                let gesamtbestand = 0;
                let niedrigeBestaende = 0;
                const kategorienLager = {};
                
                products.forEach(product => {
                    const stock = parseInt(product.bestand) || 0;
                    const price = parseFloat(product.price) || 0;
                    const minStock = parseInt(product.minStock) || 0;
                    const kategorie = product.category || 'Nicht kategorisiert';
                    
                    gesamtlagerwert += stock * price;
                    gesamtbestand += stock;
                    
                    if (stock <= minStock) {
                        niedrigeBestaende++;
                    }
                    
                    if (!kategorienLager[kategorie]) {
                        kategorienLager[kategorie] = { anzahl: 0, wert: 0, bestand: 0, niedrig: 0 };
                    }
                    kategorienLager[kategorie].anzahl++;
                    kategorienLager[kategorie].wert += stock * price;
                    kategorienLager[kategorie].bestand += stock;
                    if (stock <= minStock) kategorienLager[kategorie].niedrig++;
                });
                
                const inventoryTurnover = gesamtbestand > 0 ? (gesamtlagerwert / gesamtbestand) : 0;
                
                data.push(['LAGER-KPIs', 'Wert', 'Bewertung', 'Benchmark']);
                data.push(['💎 Gesamtlagerwert (€)', gesamtlagerwert.toFixed(2), 
                    gesamtlagerwert > 20000 ? '🏆 Sehr hoch' : gesamtlagerwert > 10000 ? '✅ Gut' : '⚠️ Ausbaufähig',
                    'Ziel: > 15.000 €']);
                data.push(['📦 Produktarten', products.length, 
                    products.length > 100 ? '🌟 Sehr vielfältig' : products.length > 50 ? '✅ Vielfältig' : '📈 Ausbaufähig',
                    'Ziel: > 75 Produkte']);
                data.push(['📊 Gesamtbestand (Stk.)', gesamtbestand, '', '']);
                data.push(['⚠️ Niedrige Bestände', niedrigeBestaende, 
                    niedrigeBestaende === 0 ? '🎯 Perfect' : niedrigeBestaende < 5 ? '✅ Gut' : '🚨 Aufmerksamkeit',
                    'Ziel: < 3 Artikel']);
                data.push(['💹 Ø Lagerwert/Artikel (€)', inventoryTurnover.toFixed(2), 
                    inventoryTurnover > 200 ? '💎 Premium' : inventoryTurnover > 100 ? '✅ Standard' : '📉 Basic',
                    'Ziel: > 150 €']);
                data.push([]);
                
                data.push(['🏷️ LAGER-KATEGORIEN ANALYSE']);
                data.push(['Kategorie', 'Anzahl Produkte', 'Lagerwert (€)', 'Ø Bestand/Produkt', 'Niedrige Bestände', 'Status']);
                Object.entries(kategorienLager).forEach(([kategorie, values]) => {
                    const avgStock = values.bestand / values.anzahl;
                    const status = values.niedrig === 0 ? '✅ Optimal' : 
                                  values.niedrig / values.anzahl < 0.2 ? '🟡 Gut' : '🔴 Kritisch';
                    
                    data.push([
                        kategorie,
                        values.anzahl,
                        values.wert.toFixed(2),
                        avgStock.toFixed(1),
                        values.niedrig,
                        status
                    ]);
                });
            }
            
            return data;
        }

        function createChartsDataSheet(buchungen, products) {
            let data = [];
            
            data.push(['OPTISPAR - DIAGRAMM-DATEN FÜR VISUALISIERUNGEN']);
            data.push(['Diese Daten können für Diagramme in Excel verwendet werden']);
            data.push([]);
            
            // Monthly Revenue Chart Data
            data.push(['📊 MONATLICHE UMSATZENTWICKLUNG']);
            data.push(['Monat', 'Einnahmen', 'Ausgaben', 'Gewinn']);
            
            const monthlyChartData = {};
            buchungen.forEach(buchung => {
                const month = new Date(buchung.date).toISOString().substr(0, 7);
                if (!monthlyChartData[month]) {
                    monthlyChartData[month] = { einnahmen: 0, ausgaben: 0 };
                }
                if (buchung.type === 'einnahme') {
                    monthlyChartData[month].einnahmen += parseFloat(buchung.amount);
                } else {
                    monthlyChartData[month].ausgaben += parseFloat(buchung.amount);
                }
            });
            
            Object.entries(monthlyChartData).sort().forEach(([month, monthData]) => {
                data.push([
                    new Date(month + '-01').toLocaleDateString('de-DE', { year: 'numeric', month: 'short' }),
                    monthData.einnahmen.toFixed(2),
                    monthData.ausgaben.toFixed(2),
                    (monthData.einnahmen - monthData.ausgaben).toFixed(2)
                ]);
            });
            
            data.push([]);
            
            // Category Distribution
            data.push(['🥧 KATEGORIE-VERTEILUNG']);
            data.push(['Kategorie', 'Gesamtwert', 'Anzahl Transaktionen']);
            
            const categoryData = {};
            buchungen.forEach(buchung => {
                const category = buchung.category || 'Nicht kategorisiert';
                if (!categoryData[category]) {
                    categoryData[category] = { wert: 0, anzahl: 0 };
                }
                categoryData[category].wert += parseFloat(buchung.amount);
                categoryData[category].anzahl++;
            });
            
            Object.entries(categoryData).forEach(([category, categoryInfo]) => {
                data.push([category, categoryInfo.wert.toFixed(2), categoryInfo.anzahl]);
            });
            
            data.push([]);
            
            // Inventory Value Distribution
            data.push(['📦 LAGERWERT-VERTEILUNG']);
            data.push(['Kategorie', 'Lagerwert', 'Anzahl Produkte', 'Ø Wert/Produkt']);
            
            const inventoryData = {};
            products.forEach(product => {
                const category = product.category || 'Nicht kategorisiert';
                const value = (parseInt(product.bestand) || 0) * (parseFloat(product.price) || 0);
                
                if (!inventoryData[category]) {
                    inventoryData[category] = { wert: 0, anzahl: 0 };
                }
                inventoryData[category].wert += value;
                inventoryData[category].anzahl++;
            });
            
            Object.entries(inventoryData).forEach(([category, inventoryInfo]) => {
                const avgValue = inventoryInfo.anzahl > 0 ? inventoryInfo.wert / inventoryInfo.anzahl : 0;
                data.push([category, inventoryInfo.wert.toFixed(2), inventoryInfo.anzahl, avgValue.toFixed(2)]);
            });
            
            return data;
        }

        function applyDashboardStyling(worksheet) {
            // Add column widths for better readability
            worksheet['!cols'] = [
                { wch: 25 }, // Column A
                { wch: 15 }, // Column B
                { wch: 15 }, // Column C
                { wch: 30 }  // Column D
            ];
        }

        function applyOverviewStyling(worksheet) {
            worksheet['!cols'] = [
                { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
                { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
                { wch: 15 }, { wch: 20 }, { wch: 25 }
            ];
        }

        function applySummaryStyling(worksheet) {
            worksheet['!cols'] = [
                { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
                { wch: 10 }, { wch: 20 }
            ];
        }

        function applyChartsStyling(worksheet) {
            worksheet['!cols'] = [
                { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
            ];
        }

        function createSummarySheet(buchungen, products, reportType) {
            let data = [];
            
            // Header
            data.push(['OPTISPAR - ZUSAMMENFASSUNG']);
            data.push(['Generiert am:', new Date().toLocaleDateString('de-DE')]);
            data.push([]); // Empty row
            
            // Financial Summary
            if (reportType === 'vollstaendig' || reportType === 'buchungen' || reportType === 'gewinn-verlust') {
                data.push(['FINANZ-ÜBERSICHT']);
                
                const currentMonth = new Date().getMonth();
                const currentYear = new Date().getFullYear();
                
                let umsatzMonat = 0, umsatzJahr = 0, kostenMonat = 0, kostenJahr = 0;
                
                buchungen.forEach(buchung => {
                    const buchungDate = new Date(buchung.datum);
                    const amount = buchung.betrag_brutto_cent / 100;
                    
                    if (buchungDate.getFullYear() === currentYear) {
                        if (buchung.typ === 'einnahme') {
                            umsatzJahr += amount;
                            if (buchungDate.getMonth() === currentMonth) {
                                umsatzMonat += amount;
                            }
                        } else if (buchung.typ === 'ausgabe') {
                            kostenJahr += amount;
                            if (buchungDate.getMonth() === currentMonth) {
                                kostenMonat += amount;
                            }
                        }
                    }
                });
                
                const gewinnMonat = umsatzMonat - kostenMonat;
                const gewinnJahr = umsatzJahr - kostenJahr;
                
                data.push(['Kennzahl', 'Aktueller Monat (€)', 'Aktuelles Jahr (€)']);
                data.push(['Umsatz', umsatzMonat.toFixed(2), umsatzJahr.toFixed(2)]);
                data.push(['Kosten', kostenMonat.toFixed(2), kostenJahr.toFixed(2)]);
                data.push(['Gewinn', gewinnMonat.toFixed(2), gewinnJahr.toFixed(2)]);
                data.push([]); // Empty row
                
                // Categories breakdown
                data.push(['KATEGORIE-AUSWERTUNG']);
                const kategorien = {};
                buchungen.forEach(buchung => {
                    const kategorie = buchung.kategorie || 'Keine Kategorie';
                    if (!kategorien[kategorie]) {
                        kategorien[kategorie] = { einnahmen: 0, ausgaben: 0 };
                    }
                    if (buchung.typ === 'einnahme') {
                        kategorien[kategorie].einnahmen += buchung.betrag_brutto_cent / 100;
                    } else {
                        kategorien[kategorie].ausgaben += buchung.betrag_brutto_cent / 100;
                    }
                });
                
                data.push(['Kategorie', 'Einnahmen (€)', 'Ausgaben (€)', 'Netto (€)']);
                Object.entries(kategorien).forEach(([kategorie, werte]) => {
                    const netto = werte.einnahmen - werte.ausgaben;
                    data.push([kategorie, werte.einnahmen.toFixed(2), werte.ausgaben.toFixed(2), netto.toFixed(2)]);
                });
                data.push([]); // Empty row
            }
            
            // Inventory Summary
            if (reportType === 'vollstaendig' || reportType === 'lager') {
                data.push(['LAGER-STATISTIKEN']);
                
                let gesamtlagerwert = 0;
                let gesamtbestand = 0;
                let niedrigeBestaende = 0;
                const kategorien = {};
                
                products.forEach(product => {
                    const stock = product.bestand || 0;
                    const price = (product.preis_netto_cent || 0) / 100;
                    const minStock = product.mindestbestand || 0;
                    
                    gesamtlagerwert += stock * price;
                    gesamtbestand += stock;
                    
                    if (stock <= minStock) {
                        niedrigeBestaende++;
                    }
                    
                    const kategorie = product.kategorie || 'Keine Kategorie';
                    if (!kategorien[kategorie]) {
                        kategorien[kategorie] = { anzahl: 0, wert: 0 };
                    }
                    kategorien[kategorie].anzahl++;
                    kategorien[kategorie].wert += stock * price;
                });
                
                data.push(['Kennzahl', 'Wert']);
                data.push(['Gesamtlagerwert (€)', gesamtlagerwert.toFixed(2)]);
                data.push(['Produktarten', products.length]);
                data.push(['Gesamtbestand (Stk.)', gesamtbestand]);
                data.push(['Niedrige Bestände', niedrigeBestaende]);
                data.push([]); // Empty row
                
                data.push(['LAGER-KATEGORIEN']);
                data.push(['Kategorie', 'Anzahl Produkte', 'Lagerwert (€)']);
                Object.entries(kategorien).forEach(([kategorie, werte]) => {
                    data.push([kategorie, werte.anzahl, werte.wert.toFixed(2)]);
                });
            }
            
            return data;
        }

        async function generateQuickReport(period) {
            // Set the period and generate report
            document.getElementById('time-period').value = period === 'heute' ? 'heute' : 
                                                          period === 'monat' ? 'dieser-monat' : 
                                                          'dieses-jahr';
            document.getElementById('report-type').value = 'vollstaendig';
            
            await generateExcelReport();
        }

        // Update stats when app loads
        async function updateReportStats() {
            try {
                const buchungen = await app.db.getAll('buchungen');
                const products = await app.db.getAll('waren');
                
                document.getElementById('stats-buchungen').textContent = buchungen.length;
                document.getElementById('stats-produkte').textContent = products.length;
            } catch (error) {
                console.error('Error updating stats:', error);
            }
        }

        // =====================================
        // REPORTS
        // =====================================

        async function generateMonthlyReport() {
            const reportContainer = document.getElementById('report-content');
            const buchungen = await app.db.getAll('buchungen');
            const thisMonth = new Date().toISOString().substr(0, 7);
            
            let einnahmen = 0, ausgaben = 0, anzahl = 0;
            buchungen.forEach(buchung => {
                if (buchung.datum.substr(0, 7) === thisMonth) {
                    if (buchung.typ === 'einnahme') {
                        einnahmen += buchung.betrag_brutto_cent;
                    } else {
                        ausgaben += buchung.betrag_brutto_cent;
                    }
                    anzahl++;
                }
            });
            
            reportContainer.innerHTML = `
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4">Monatsbericht ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="text-center p-4 bg-green-50 rounded">
                            <div class="text-2xl font-bold text-green-600">${app.formatCurrency(einnahmen)}</div>
                            <div class="text-sm text-gray-600">Einnahmen</div>
                        </div>
                        <div class="text-center p-4 bg-red-50 rounded">
                            <div class="text-2xl font-bold text-red-600">${app.formatCurrency(ausgaben)}</div>
                            <div class="text-sm text-gray-600">Ausgaben</div>
                        </div>
                        <div class="text-center p-4 bg-blue-50 rounded">
                            <div class="text-2xl font-bold text-blue-600">${app.formatCurrency(einnahmen - ausgaben)}</div>
                            <div class="text-sm text-gray-600">Gewinn</div>
                        </div>
                    </div>
                    <div class="mt-6 text-center text-sm text-gray-500">Anzahl Buchungen: ${anzahl}</div>
                </div>
            `;
        }

        async function generateYearlyReport() {
            const reportContainer = document.getElementById('report-content');
            const buchungen = await app.db.getAll('buchungen');
            const thisYear = new Date().getFullYear().toString();
            
            let einnahmen = 0, ausgaben = 0, anzahl = 0;
            buchungen.forEach(buchung => {
                if (buchung.datum.substr(0, 4) === thisYear) {
                    if (buchung.typ === 'einnahme') {
                        einnahmen += buchung.betrag_brutto_cent;
                    } else {
                        ausgaben += buchung.betrag_brutto_cent;
                    }
                    anzahl++;
                }
            });
            
            reportContainer.innerHTML = `
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4">Jahresbericht ${thisYear}</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="text-center p-4 bg-green-50 rounded">
                            <div class="text-2xl font-bold text-green-600">${app.formatCurrency(einnahmen)}</div>
                            <div class="text-sm text-gray-600">Einnahmen</div>
                        </div>
                        <div class="text-center p-4 bg-red-50 rounded">
                            <div class="text-2xl font-bold text-red-600">${app.formatCurrency(ausgaben)}</div>
                            <div class="text-sm text-gray-600">Ausgaben</div>
                        </div>
                        <div class="text-center p-4 bg-blue-50 rounded">
                            <div class="text-2xl font-bold text-blue-600">${app.formatCurrency(einnahmen - ausgaben)}</div>
                            <div class="text-sm text-gray-600">Gewinn</div>
                        </div>
                    </div>
                    <div class="mt-6 text-center text-sm text-gray-500">Anzahl Buchungen: ${anzahl}</div>
                </div>
            `;
        }

        async function generateInventoryReport() {
            const reportContainer = document.getElementById('report-content');
            const waren = await app.db.getAll('waren');
            
            const gesamtWert = waren.reduce((sum, ware) => sum + ((ware.bestand || 0) * (ware.preis_netto_cent || 0)), 0);
            const gesamtBestand = waren.reduce((sum, ware) => sum + (ware.bestand || 0), 0);
            const niedrigerBestand = waren.filter(ware => (ware.bestand || 0) <= (ware.mindestbestand || 0));
            
            let html = `
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4">Lagerbericht</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div class="text-center p-4 bg-blue-50 rounded">
                            <div class="text-2xl font-bold text-blue-600">${app.formatCurrency(gesamtWert)}</div>
                            <div class="text-sm text-gray-600">Gesamtwert Lager</div>
                        </div>
                        <div class="text-center p-4 bg-green-50 rounded">
                            <div class="text-2xl font-bold text-green-600">${gesamtBestand}</div>
                            <div class="text-sm text-gray-600">Gesamtbestand (Stk.)</div>
                        </div>
                        <div class="text-center p-4 bg-red-50 rounded">
                            <div class="text-2xl font-bold text-red-600">${niedrigerBestand.length}</div>
                            <div class="text-sm text-gray-600">Niedriger Bestand</div>
                        </div>
                    </div>
            `;
            
            if (niedrigerBestand.length > 0) {
                html += `
                    <div class="mb-4">
                        <h4 class="font-semibold text-red-600 mb-2">⚠️ Produkte mit niedrigem Bestand:</h4>
                        <div class="space-y-2">
                `;
                
                niedrigerBestand.forEach(ware => {
                    html += `
                        <div class="flex justify-between items-center p-3 bg-red-50 rounded">
                            <span class="font-medium">${ware.name}</span>
                            <span class="text-sm text-red-600">Bestand: ${ware.bestand || 0} / Min: ${ware.mindestbestand || 0}</span>
                        </div>
                    `;
                });
                
                html += `</div></div>`;
            }
            
            html += `</div>`;
            reportContainer.innerHTML = html;
        }

        // =====================================
        // NOTIFICATION SYSTEM
        // =====================================

        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            const notificationText = document.getElementById('notification-text');
            
            // Set message and type
            notificationText.textContent = message;
            notification.className = `notification ${type}`;
            
            // Show notification
            notification.classList.add('show');
            
            // Auto hide after 3 seconds
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }

        // =====================================
        // INITIALIZATION & FIRST TIME SETUP
        // =====================================

        // Check if this is the first time opening the app
        function checkFirstTimeSetup() {
            const hasSeenSetup = localStorage.getItem('optispar-setup-complete');
            const savedPath = localStorage.getItem('optispar-data-path');
            
            if (!hasSeenSetup || !savedPath) {
                setTimeout(() => {
                    document.getElementById('first-time-setup-modal').classList.add('active');
                }, 1000); // Show after 1 second to let the app load
            } else {
                // Show current path in notification
                showNotification(`Datenordner: ${savedPath}`, 'info');
            }
        }

        // Close first time setup modal
        function closeFirstTimeSetup() {
            const dontShowAgain = document.getElementById('dont-show-setup-again').checked;
            const customPath = document.getElementById('data-folder-path').value.trim();
            
            if (dontShowAgain) {
                localStorage.setItem('optispar-setup-complete', 'true');
            }
            
            // Save the data path
            if (customPath) {
                localStorage.setItem('optispar-data-path', customPath);
                showNotification(`Datenordner festgelegt: ${customPath}`, 'success');
            } else {
                // Default path
                localStorage.setItem('optispar-data-path', 'Optispar-Daten');
            }
            
            document.getElementById('first-time-setup-modal').classList.remove('active');
        }

        // Reset/change data path
        function resetDataPath() {
            localStorage.removeItem('optispar-setup-complete');
            localStorage.removeItem('optispar-data-path');
            document.getElementById('first-time-setup-modal').classList.remove('active');
            setTimeout(() => {
                checkFirstTimeSetup();
            }, 500);
        }

        // Update data path display
        function updateDataPathDisplay() {
            const savedPath = localStorage.getItem('optispar-data-path') || 'Nicht festgelegt';
            const pathElement = document.getElementById('current-data-path');
            if (pathElement) {
                pathElement.textContent = savedPath;
                pathElement.title = `Vollständiger Pfad: ${savedPath}`;
            }
            
            // Update last backup time
            updateLastBackupTime();
        }

        // Update last backup time display
        function updateLastBackupTime() {
            const lastBackup = localStorage.getItem('optispar-last-backup');
            const backupElement = document.getElementById('last-backup-time');
            if (backupElement) {
                if (lastBackup) {
                    const backupDate = new Date(lastBackup);
                    backupElement.textContent = `Letztes Backup: ${backupDate.toLocaleString('de-DE')}`;
                } else {
                    backupElement.textContent = 'Noch kein Backup erstellt';
                }
            }
        }

        // Show file information
        function showFileInfo() {
            const savedPath = localStorage.getItem('optispar-data-path') || 'Nicht festgelegt';
            const fileHandle = localStorage.getItem('optispar-file-handle');
            const lastBackup = localStorage.getItem('optispar-last-backup');
            
            let info = `📁 Datenordner: ${savedPath}\n\n`;
            
            if (fileHandle) {
                const handleInfo = JSON.parse(fileHandle);
                info += `📄 Letzte Datei: ${handleInfo.name}\n`;
                info += `🕒 Zeitpunkt: ${new Date(handleInfo.saved || handleInfo.loaded).toLocaleString('de-DE')}\n\n`;
            }
            
            if (lastBackup) {
                info += `💾 Letztes Backup: ${new Date(lastBackup).toLocaleString('de-DE')}\n`;
            }
            
            info += `\n🎯 Empfohlene Dateistruktur:\n`;
            info += `${savedPath}\\optispar-daten.json (Hauptdatei)\n`;
            info += `${savedPath}\\Backup\\ (Sicherungen)\n`;
            info += `${savedPath}\\Berichte\\ (Excel-Reports)`;
            
            alert(info);
        }

        // Enhanced file import handler
        async function handleFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                // Validate data
                if (data.konten || data.buchungen || data.waren || data.exportInfo) {
                    const confirm = window.confirm(
                        `Daten aus "${file.name}" importieren?\n\n` +
                        `Dies wird alle vorhandenen Daten überschreiben.\n` +
                        `Möchten Sie fortfahren?`
                    );
                    
                    if (confirm) {
                        await importOptisparData(data);
                        showNotification(`✅ Daten aus "${file.name}" erfolgreich importiert!`, 'success');
                        
                        // Update file status
                        const fileStatusElement = document.getElementById('file-status');
                        if (fileStatusElement) {
                            fileStatusElement.textContent = `Letzte Datei: ${file.name}`;
                        }
                        
                        // Save import info
                        localStorage.setItem('optispar-file-handle', JSON.stringify({
                            name: file.name,
                            loaded: new Date().toISOString()
                        }));
                    }
                } else {
                    showNotification('❌ Keine gültige Optispar-Datei', 'error');
                }
                
            } catch (error) {
                console.error('Import error:', error);
                showNotification('❌ Fehler beim Importieren der Datei', 'error');
            }
            
            // Reset file input
            event.target.value = '';
        }

        // Create folder structure guide
        function createFolderStructureGuide() {
            const guideContent = `# Optispar - Ordnerstruktur Anleitung

## Empfohlene Ordnerstruktur

Erstellen Sie diese Ordner im gleichen Verzeichnis wie Ihre optispar-komplett.html:

\`\`\`
Optispar-Daten/
├── Buchungen/          # Alle Finanzdaten und Buchungsbelege
├── Lager/             # Produktdaten, Lagerbewegungen, Inventarlisten  
├── Berichte/          # Excel-Reports und Analysen
├── Backup/            # Automatische Datensicherungen
├── Dokumente/         # Weitere Belege und Dokumente
└── optispar-daten.json # Hauptdatenbank-Datei
\`\`\`

## Funktionen pro Ordner

### 📁 Buchungen/
- Alle Einnahmen und Ausgaben
- Buchungsbelege (PDF, Bilder)
- Rechnungen und Quittungen
- Steuerrelevante Dokumente

### 📁 Lager/
- Produktstammdaten
- Lagerbewegungen (Ein-/Ausgänge)
- Inventurlisten
- Lieferantenunterlagen

### 📁 Berichte/
- Excel-Reports werden automatisch hier gespeichert
- Monats-/Jahresberichte
- KPI-Analysen
- Steuerberichte

### 📁 Backup/
- Automatische Datensicherungen (täglich)
- Manuelle Backup-Dateien
- Wiederherstellungspunkte

### 📁 Dokumente/
- Allgemeine Geschäftsdokumente
- Verträge und Vereinbarungen
- Korrespondenz

## Automatische Funktionen

Die App wird automatisch:
- Backups in den Backup/ Ordner erstellen
- Excel-Reports in den Berichte/ Ordner exportieren
- Daten strukturiert organisieren
- Regelmäßige Datensicherungen durchführen

## Erste Schritte

1. Erstellen Sie den Hauptordner "Optispar-Daten"
2. Erstellen Sie die Unterordner wie oben beschrieben
3. Die App wird automatisch mit dieser Struktur arbeiten
4. Nutzen Sie die Export/Import-Funktionen für Datensicherungen

---
Erstellt am: ${new Date().toLocaleDateString('de-DE')}
Optispar Buchhaltungssystem
`;

            // Download the guide as markdown file
            const blob = new Blob([guideContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Optispar-Ordnerstruktur-Anleitung.md';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showNotification('Anleitung erfolgreich heruntergeladen!', 'success');
        }

        // Enhanced data export with REAL folder integration
        async function exportDataWithStructure() {
            try {
                const savedPath = localStorage.getItem('optispar-data-path') || 'Optispar-Daten';
                
                const data = {
                    version: "1.0",
                    exportInfo: {
                        version: "1.0",
                        exported: new Date().toISOString(),
                        structure: "Optispar-Ordnerstruktur",
                        dataPath: savedPath,
                        filename: "optispar-daten.json"
                    },
                    konten: await app.db.getAll('konten'),
                    buchungen: await app.db.getAll('buchungen'),
                    waren: await app.db.getAll('waren'),
                   lagerbewegungen: await app.db.getAll('lagerbewegungen'),
                    bestellungen: await modernBestellungenDB.getAll()
                };
                
                // Try to use File System Access API for direct folder access (Chrome/Edge)
                if ('showSaveFilePicker' in window) {
                    try {
                        const fileHandle = await window.showSaveFilePicker({
                            suggestedName: 'optispar-daten.json',
                            types: [{
                                description: 'Optispar Daten',
                                accept: { 'application/json': ['.json'] }
                            }]
                        });
                        
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(data, null, 2));
                        await writable.close();
                        
                        showNotification(`✅ Daten erfolgreich in ${fileHandle.name} gespeichert!`, 'success');
                        
                        // Save the file handle for future auto-saves
                        localStorage.setItem('optispar-file-handle', JSON.stringify({
                            name: fileHandle.name,
                            saved: new Date().toISOString()
                        }));
                        
                        return;
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            console.error('File System API error:', error);
                        }
                    }
                }
                
                // Fallback to traditional download with improved filename
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                const dateStr = new Date().toISOString().split('T')[0];
                link.download = `optispar-daten.json`;
                
                // Auto-click to download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                showNotification(`📁 Datei heruntergeladen! Speichern Sie sie in: ${savedPath}\\optispar-daten.json`, 'success');
                
                // Show detailed save instructions
                setTimeout(() => {
                    showNotification(`💡 Tipp: Speichern Sie die Datei als "optispar-daten.json" in Ihrem Optispar-Ordner`, 'info');
                }, 3000);
                
            } catch (error) {
                console.error('Export error:', error);
                showNotification('Fehler beim Exportieren der Daten', 'error');
            }
        }

        // Enhanced auto-save function
        async function createAutoSave() {
            try {
                const data = {
                    version: "1.0",
                    backupInfo: {
                        type: "auto-save",
                        created: new Date().toISOString(),
                        version: "1.0"
                    },
                    konten: await app.db.getAll('konten'),
                    buchungen: await app.db.getAll('buchungen'),
                    waren: await app.db.getAll('waren'),
                    lagerbewegungen: await app.db.getAll('lagerbewegungen'),
                    bestellungen: await modernBestellungenDB.getAll()
                };
                
                // Store in localStorage as backup
                localStorage.setItem('optispar-auto-backup', JSON.stringify(data));
                localStorage.setItem('optispar-last-backup', new Date().toISOString());
                

                // Create downloadable backup file
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
                link.href = url;
                link.download = `optispar-backup-${dateStr}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                showNotification('🔄 Auto-Backup erstellt und heruntergeladen', 'info');
                updateLastBackupTime();
                console.log('Auto-backup created:', new Date().toISOString());

            } catch (error) {
                console.error('Auto-backup failed:', error);
                showNotification('Fehler beim Auto-Backup', 'error');
            }
        }

        // Smart file loader function
        async function loadFromFolder() {
            try {
                const savedPath = localStorage.getItem('optispar-data-path') || 'Optispar-Daten';
                
                // Try to use File System Access API for direct folder access
                if ('showOpenFilePicker' in window) {
                    try {
                        const [fileHandle] = await window.showOpenFilePicker({
                            types: [{
                                description: 'Optispar Daten',
                                accept: { 'application/json': ['.json'] }
                            }],
                            multiple: false
                        });
                        
                        const file = await fileHandle.getFile();
                        const text = await file.text();
                        const data = JSON.parse(text);
                        
                        // Validate and import
                        if (data.konten || data.buchungen || data.waren || data.bestellungen || data.exportInfo || data.backupInfo) {
                            await importOptisparData(data);
                            showNotification(`✅ Daten aus "${file.name}" erfolgreich geladen!`, 'success');
                            
                            // Save file reference for future auto-saves
                            localStorage.setItem('optispar-file-handle', JSON.stringify({
                                name: file.name,
                                loaded: new Date().toISOString()
                            }));
                            
                            return true;
                        } else {
                            throw new Error('Keine gültige Optispar-Datei');
                        }
                        
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            console.error('File loading error:', error);
                            showNotification('❌ Fehler beim Laden der Datei', 'error');
                        }
                        return false;
                    }
                }
                
                // Fallback to traditional file input
                const input = document.getElementById('import-file-input');
                if (input) {
                    input.click();
                } else {
                    showNotification('❌ Datei-Import nicht verfügbar', 'error');
                }
                
            } catch (error) {
                console.error('Load error:', error);
                showNotification('❌ Fehler beim Laden', 'error');
            }
        }
        function createBuchungenSheetData(buchungen) {
            const data = [[
                'Datum',
                'Beschreibung',
                'Typ',
                'Kategorie',
                'Konto',
                'Rechnungsnummer',
                'Name/Firma',
                'Netto (€)',
                'MwSt (€)',
                'Brutto (€)'
            ]];            buchungen.forEach(b => {
                const date = new Date(b.date || b.datum).toLocaleDateString('de-DE');
                const amount = parseFloat(b.amount || b.betrag || (b.betrag_brutto_cent || 0) / 100) || 0;
                const net = (amount * 0.84).toFixed(2);
                const vat = (amount * 0.16).toFixed(2);
                data.push([
                    date,
                    b.description || b.beschreibung || '',
                    (b.type || b.typ) === 'einnahme' ? 'Einnahme' : 'Ausgabe',
                    b.category || b.kategorie || '',
                    b.account || b.konto || '',
                    b.rechnungsnummer || b.invoiceNumber || '',
                    b.kundeName || b.kunde || b.customer || '',
                    net,
                    vat,
                    amount.toFixed(2)
                ]);
            });
            return data;
        }

        function createProductsSheetData(products) {
            const data = [['Produktname', 'SKU', 'Kategorie', 'Lieferant', 'Netto (€)', 'Brutto (€)', 'Bestand', 'Min. Bestand', 'Lagerwert (€)']];
            products.forEach(p => {
                const priceNet = parseFloat(p.price || (p.preis_netto_cent || 0) / 100) || 0;
                const priceGross = parseFloat(p.priceGross || (p.preis_brutto_cent || 0) / 100) || (priceNet * 1.19);
                const stock = parseInt(p.bestand || 0);
                const minStock = parseInt(p.minStock || p.mindestbestand || 0);
                const value = (stock * priceNet).toFixed(2);
                data.push([
                    p.name,
                    p.sku || '',
                    p.category || p.kategorie || '',
                    p.supplier || '',
                    priceNet.toFixed(2),
                    priceGross.toFixed(2),
                    stock,
                    minStock,
                    value
                ]);
            });
            return data;
        }
        function createBewegungenSheetData(bewegungen) {
            const data = [['Datum', 'Zeit', 'Produkt', 'Typ', 'Menge', 'Bestand alt', 'Bestand neu', 'Grund', 'Referenz', 'Lieferant', 'Kunde', 'Notiz']];
            bewegungen.forEach(b => {
                const date = new Date(b.timestamp).toLocaleDateString('de-DE');
                const time = new Date(b.timestamp).toLocaleTimeString('de-DE');
                const product = b.productName || b.produktName || 'Unbekanntes Produkt';
                const type = b.type || b.typ || '';
                const quantity = b.quantity ?? b.menge ?? '';
                const oldStock = b.alterBestand ?? '';
                const newStock = b.neuerBestand ?? '';
                const reason = b.grund || (b.reason ? (app.getReasonText ? app.getReasonText(b.reason) : b.reason) : '');
                const reference = b.reference || '';
                const supplier = b.supplier || b.lieferant || '';
                const customer = b.customer || b.kunde || '';
                const notes = b.notes || b.notiz || '';
                data.push([date, time, product, type, quantity, oldStock, newStock, reason, reference, supplier, customer, notes]);
            });
            return data;
        }
        function createBestellungenSheetData(bestellungen) {
            const data = [['Datum', 'Bezeichnung', 'Händler', 'Menge', 'Betrag (€)', 'Sendungsnummer', 'Status', 'Notizen']];
            bestellungen.forEach(b => {
                const date = new Date(b.datum).toLocaleDateString('de-DE');
                const status = b.status ? Object.entries(b.status).filter(([_, v]) => v).map(([k]) => k).join(', ') : '';
                data.push([
                    date,
                    b.bezeichnung || '',
                    b.haendler || '',
                    b.menge ?? '',
                    b.betrag != null ? parseFloat(b.betrag).toFixed(2) : '',
                    b.sendungsnummer || '',
                    status,
                    b.notizen || ''
                ]);
            });
            return data;
        }

        function createKontenSheetData(konten) {
            const data = [['Nummer', 'Name', 'Typ', 'Kategorie', 'Aktiv']];
            konten.forEach(k => {
                data.push([
                    k.nummer,
                    k.name,
                    k.typ || '',
                    k.kategorie || '',
                    k.aktiv ? 'Ja' : 'Nein'
                ]);
            });
            return data;
        }


        // Enhanced Excel export with folder structure
        async function generateExcelReportWithStructure() {
            try {
                showNotification('📊 Excel-Bericht wird erstellt...', 'info');
                
                const savedPath = localStorage.getItem('optispar-data-path') || 'Optispar-Daten';
                const reportType = document.getElementById('report-type').value;
                const { fromDate, toDate } = getDateRange();
                
                // Get data
                const buchungen = await app.db.getAll('buchungen');
                const products = await app.db.getAll('waren');
                const bewegungen = await app.db.getAll('lagerbewegungen');
                const bestellungen = await modernBestellungenDB.getAll();
                const konten = await app.db.getAll('konten');

                console.log('Data retrieved:', { buchungen: buchungen.length, products: products.length, bewegungen: bewegungen.length, bestellungen: bestellungen.length, konten: konten.length });
                // Filter by date range
                const filteredBuchungen = filterDataByDate(buchungen, fromDate, toDate);
                const filteredBewegungen = filterDataByDate(bewegungen, fromDate, toDate);
                const filteredBestellungen = filterDataByDate(bestellungen, fromDate, toDate);
                // Verify XLSX library is loaded
                if (typeof XLSX === 'undefined') {
                    throw new Error('XLSX-Bibliothek nicht geladen');
                }
                
                console.log('Creating workbook...');
                
                // Create workbook with professional styling
                const wb = XLSX.utils.book_new();
                wb.Props = {
                    Title: "Optispar Finanz- und Lagerbericht",
                    Subject: "Professioneller Geschäftsbericht", 
                    Author: "Optispar Buchhaltungssystem",
                    CreatedDate: new Date()
                };
                
                // Sheet: Zusammenfassung & Analysen
                const summaryData = createEnhancedSummarySheet(filteredBuchungen, products, reportType);
                const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
                applySummaryStyling(wsSummary);
                XLSX.utils.book_append_sheet(wb, wsSummary, "Zusammenfassung");

                // Sheet: Buchungen (alle Transaktionen)
                const buchungenSheetData = createBuchungenSheetData(filteredBuchungen);
                const wsBuchungen = XLSX.utils.aoa_to_sheet(buchungenSheetData);
                wsBuchungen['!cols'] = [
                    { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
                    { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 12 },
                    { wch: 12 }, { wch: 12 }
                ];
                wsBuchungen['!autofilter'] = { ref: `A1:J${buchungenSheetData.length}` };
                XLSX.utils.book_append_sheet(wb, wsBuchungen, "Buchungen");

                // Sheet: Produkte (Inventar)
                const productsSheetData = createProductsSheetData(products);
                const wsProducts = XLSX.utils.aoa_to_sheet(productsSheetData);
                wsProducts['!cols'] = [
                    { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
                    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
                ];
                wsProducts['!autofilter'] = { ref: `A1:I${productsSheetData.length}` };
                XLSX.utils.book_append_sheet(wb, wsProducts, "Produkte");

                // Sheet: Lagerbewegungen
                const bewegungenSheetData = createBewegungenSheetData(filteredBewegungen);
                const wsBewegungen = XLSX.utils.aoa_to_sheet(bewegungenSheetData);
                wsBewegungen['!cols'] = [
                    { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 12 }, { wch: 8 },
                    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }
                ];
                wsBewegungen['!autofilter'] = { ref: `A1:L${bewegungenSheetData.length}` };
                XLSX.utils.book_append_sheet(wb, wsBewegungen, "Bewegungen");

                // Sheet: Bestellungen
                const bestellungenSheetData = createBestellungenSheetData(filteredBestellungen);
                const wsBestellungen = XLSX.utils.aoa_to_sheet(bestellungenSheetData);
                wsBestellungen['!cols'] = [
                    { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
                    { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 30 }
                ];
                wsBestellungen['!autofilter'] = { ref: `A1:H${bestellungenSheetData.length}` };
                XLSX.utils.book_append_sheet(wb, wsBestellungen, "Bestellungen");

                // Sheet: Konten
                const kontenSheetData = createKontenSheetData(konten);
                const wsKonten = XLSX.utils.aoa_to_sheet(kontenSheetData);
                wsKonten['!cols'] = [
                    { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 }
                ];
                wsKonten['!autofilter'] = { ref: `A1:E${kontenSheetData.length}` };
                XLSX.utils.book_append_sheet(wb, wsKonten, "Konten");
                // Generate filename with timestamp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `Optispar_Bericht_${timestamp}.xlsx`;
                

                // Build ZIP containing Excel and all booking PDFs
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const zip = new JSZip();
                zip.file(filename, wbout);

                // Add each booking PDF attachment as separate file in the ZIP
                const belegeFolder = zip.folder('Belege');
                for (const b of filteredBuchungen) {
                    if (b.beleg && b.beleg.data) {
                        try {
                            const pdfBytes = base64ToUint8Array(b.beleg.data.split(',')[1]);
                            const pdfName = b.beleg.name || 'Beleg.pdf';
                            belegeFolder.file(pdfName, pdfBytes);
                        } catch (e) {
                            console.warn('Fehler beim Hinzufügen eines Belegs:', e);
                        }
                        
                    }
                }

                // Add Wareneingang PDFs
                const wareneingangFolder = zip.folder('Wareneingang');
                for (const m of filteredBewegungen) {
                    if (m.typ === 'eingang' && m.beleg && m.beleg.data) {
                        try {
                            const pdfBytes = base64ToUint8Array(m.beleg.data.split(',')[1]);
                            const pdfName = m.beleg.name || 'Wareneingang.pdf';
                            wareneingangFolder.file(pdfName, pdfBytes);
                        } catch (e) {
                            console.warn('Fehler beim Hinzufügen eines Wareneingang-Belegs:', e);
                        }
                    }
                }

                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const zipLink = document.createElement('a');
                zipLink.href = URL.createObjectURL(zipBlob);
                zipLink.download = filename.replace('.xlsx', '.zip');
                zipLink.style.display = 'none';

                document.body.appendChild(zipLink);
                zipLink.click();
                document.body.removeChild(zipLink);
                setTimeout(() => URL.revokeObjectURL(zipLink.href), 1000);

                showNotification('✅ ZIP-Bericht erfolgreich heruntergeladen!', 'success');
                setTimeout(() => {
                    showNotification(`💡 Speichern Sie den Bericht in: ${savedPath}/Berichte/`, 'info');
                }, 2000);
            } catch (error) {
                console.error('❌ Excel export error:', error);
                showNotification(`Fehler beim Erstellen des Berichts: ${error.message}`, 'error');
                
                // Show browser-specific help
                setTimeout(() => {
                    showNotification('💡 Tipp: Prüfen Sie Ihre Browser-Download-Einstellungen', 'info');
                }, 3000);
            }
        }
        
        // Helper function for CSV conversion
        function convertToCSV(buchungen, products) {
            let csv = 'Optispar Buchhaltungsbericht\n';
            csv += `Erstellt am,${new Date().toLocaleDateString('de-DE')}\n\n`;
            
            csv += 'Buchungen:\n';
            csv += 'Datum,Kunde,Beschreibung,Betrag,Typ\n';
            buchungen.forEach(b => {
                csv += `${b.datum},${b.kundeName},${b.beschreibung},${b.betrag},${b.typ}\n`;
            });
            
            csv += '\nProdukte:\n';
            csv += 'Name,Bestand,Preis\n';
            products.forEach(p => {
                csv += `${p.name},${p.bestand || 0},${(p.preis_netto_cent || 0) / 100}\n`;
            });
            
            return csv;
        }
        // Helper to convert base64 string to Uint8Array
        function base64ToUint8Array(base64) {
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        // =====================================
        // EVENT LISTENERS & INITIALIZATION
        // =====================================

        document.addEventListener('DOMContentLoaded', async () => {
            console.log('DOM loaded, initializing Optispar...');
            
            try {
                app = new OptisparApp();
                await app.init();
                restoreSession();
                updateUserMenu();
                document.getElementById('app-version').textContent = `Version ${APP_VERSION}`;

                // Update report stats
                await updateReportStats();
                
                // Update current data path display
                updateDataPathDisplay();
                
                // Check for first time setup
                checkFirstTimeSetup();
                
                // Auto-backup disabled
                // setInterval(createAutoSave, 30 * 60 * 1000);
                
                // Setup drag and drop for import
                setupDragAndDrop();
                
                // Form event listeners

                preventDoubleSubmit('modern-bestellung-form');
                
                preventDoubleSubmit('product-form');
                preventDoubleSubmit('konto-form');
                preventDoubleSubmit('wareneingang-form');
                preventDoubleSubmit('warenausgang-form');
                preventDoubleSubmit('stock-adjustment-form');
                preventDoubleSubmit('user-form');
                preventDoubleSubmit('settings-form');
                document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
                document.getElementById('booking-kunde-name').addEventListener('change', handleCustomerChange);
                document.getElementById('product-form').addEventListener('submit', handleProductSubmit);
                document.getElementById('user-form').addEventListener('submit', handleUserSubmit);
                document.getElementById('settings-form').addEventListener('submit', handleSettingsChange);
                const userMenuButton = document.getElementById('user-menu-button');
                const userMenuDropdown = document.getElementById('user-menu-dropdown');
                if (userMenuButton && userMenuDropdown) {
                    userMenuButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        userMenuDropdown.classList.toggle('hidden');
                    });
                    userMenuDropdown.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });
                    document.addEventListener('click', () => {
                        userMenuDropdown.classList.add('hidden');
                    });
                }
                // Modal close on outside click
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            modal.classList.remove('active');
                        }
                    });
                });
                
                // ESC key to close modals
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        document.querySelectorAll('.modal.active').forEach(modal => {
                            modal.classList.remove('active');
                        });
                    }
                });
                
                console.log('Optispar initialized successfully!');
                
                // Hide loading overlay and enable interactions
                const loadingOverlay = document.getElementById('loading-overlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.remove('active');
                    console.log('Loading overlay removed - app ready for interaction!');
                }
                
                // Initialize modern bestellungen system
                await initModernBestellungen();
                
                // Show success message
                setTimeout(() => {
                    showNotification('✅ Optispar erfolgreich geladen!', 'success');
                }, 500);
                
            } catch (error) {
                console.error('Failed to initialize Optispar:', error);
                
                // Hide loading overlay even on error
                const loadingOverlay = document.getElementById('loading-overlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.remove('active');
                }
                
        showNotification('Fehler beim Initialisieren der Anwendung', 'error');
        }
        });
    
        // Basismodul für Chats
        document.addEventListener('DOMContentLoaded', () => {
            const SESSION_KEY = 'oplokal_session';
            const currentUser = () => (window.app && window.app.currentUser) || (JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').user);

            const convKey = 'optispar_chat_conversations';
            let conversations = JSON.parse(localStorage.getItem(convKey) || '[]');
            const messages = {};
            conversations.forEach(c => {
                messages[c.id] = JSON.parse(localStorage.getItem(`optispar_chat_${c.id}`) || '[]');
            });

            const convListEl = document.getElementById('conversation-list');
            const noConvEl = document.getElementById('no-conversations');
            const chatHeader = document.getElementById('chat-header');
            const chatMessages = document.getElementById('chat-messages');
            const chatEmpty = document.getElementById('chat-empty');
            const formEl = document.getElementById('chat-input-form');
            const inputEl = document.getElementById('chat-input');
            const attachInput = document.getElementById('chat-attachment');
            const attachBtn = document.getElementById('chat-attach-btn');
            const searchEl = document.getElementById('chat-search');

            let activeConv = null;
            let users = [];

            function saveConversations() {
                localStorage.setItem(convKey, JSON.stringify(conversations));
            }
            function saveMessages(id) {
                localStorage.setItem(`optispar_chat_${id}`, JSON.stringify(messages[id] || []));
            }

            async function renderConversations() {
                convListEl.innerHTML = '';
                if (!users.length) users = await loadUsers();
                const list = users.filter(u => u.id !== currentUser()?.id);
                if (!list.length) {
                    noConvEl.classList.remove('hidden');
                    return;
                }
                noConvEl.classList.add('hidden');
                list.forEach(u => {
                    const conv = conversations.find(c => c.participants.includes(u.id));
                    const unread = conv ? conv.unread : 0;
                    const item = document.createElement('div');
                    item.className = 'p-3 hover:bg-gray-100 cursor-pointer flex justify-between';
                    item.dataset.name = u.name.toLowerCase();
                    item.innerHTML = `<span>${u.name}</span>` + (unread ? `<span class="ml-2 bg-blue-500 text-white text-xs rounded-full px-2">${unread}</span>` : '');
                    item.addEventListener('click', () => {
                        let existing = conversations.find(c => c.participants.includes(u.id));
                        if (!existing) {
                            existing = { id: 'c' + Date.now(), participants: [currentUser().id, u.id], last_message_at: null, unread: 0, otherName: u.name, otherRole: u.rolle };
                            conversations.push(existing);
                            saveConversations();
                        }
                        messages[existing.id] = messages[existing.id] || [];
                        openConversation(existing.id);
                    });
                    convListEl.appendChild(item);
                });
            }

            function renderMessages() {
                const msgs = messages[activeConv.id] || [];
                chatMessages.innerHTML = '';
                if (!msgs.length) {
                    chatEmpty.textContent = `Schreib eine erste Nachricht an ${activeConv.otherName || ''} …`;
                    chatEmpty.classList.remove('hidden');
                } else {
                    chatEmpty.classList.add('hidden');
                }
                msgs.forEach(msg => {
                    const wrap = document.createElement('div');
                    const own = msg.author_id === currentUser().id;
                    wrap.className = 'flex ' + (own ? 'justify-end' : 'justify-start') + ' group';
                    const bubble = document.createElement('div');
                    bubble.className = `px-3 py-2 rounded-lg max-w-xs ${own ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'}`;
                    if (msg.type === 'attachment') {
                        if (msg.content.startsWith('data:image')) {
                            const img = document.createElement('img');
                            img.src = msg.content;
                            img.className = 'max-w-xs rounded';
                            bubble.appendChild(img);
                        } else {
                            const link = document.createElement('a');
                            link.href = msg.content;
                            link.textContent = 'Anhang';
                            link.target = '_blank';
                            bubble.appendChild(link);
                        }
                    } else {
                        bubble.textContent = msg.content;
                    }
                    const meta = document.createElement('div');
                    meta.className = 'text-xs mt-1 text-right';
                    meta.textContent = msg.status || 'sent';
                    bubble.appendChild(meta);
                    wrap.appendChild(bubble);
                    if (own) {
                        const actions = document.createElement('div');
                        actions.className = 'hidden group-hover:flex items-center space-x-1 ml-2 text-xs';
                        const edit = document.createElement('button');
                        edit.textContent = '✏️';
                        edit.addEventListener('click', () => {
                            const txt = prompt('Nachricht bearbeiten', msg.content);
                            if (txt !== null) {
                                msg.content = txt;
                                msg.edited_at = new Date().toISOString();
                                saveMessages(activeConv.id);
                                renderMessages();
                            }
                        });
                        const del = document.createElement('button');
                        del.textContent = '🗑️';
                        del.addEventListener('click', () => {
                            const arr = messages[activeConv.id];
                            const idx = arr.findIndex(m => m.id === msg.id);
                            if (idx > -1) {
                                arr.splice(idx, 1);
                                saveMessages(activeConv.id);
                                renderMessages();
                            }
                        });
                        const star = document.createElement('button');
                        star.textContent = msg.important ? '⭐' : '☆';
                        star.addEventListener('click', () => {
                            msg.important = !msg.important;
                            star.textContent = msg.important ? '⭐' : '☆';
                            saveMessages(activeConv.id);
                        });
                        actions.append(edit, del, star);
                        wrap.appendChild(actions);
                    }
                    chatMessages.appendChild(wrap);
                });
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            function openConversation(id) {
                activeConv = conversations.find(c => c.id === id);
                if (!activeConv) return;
                activeConv.unread = 0;
                saveConversations();
                const other = activeConv.otherName || '';
                chatHeader.classList.remove('hidden');
                chatHeader.innerHTML = `<div><div class="font-semibold">${other}</div><div class="text-sm text-gray-500">${activeConv.otherRole || ''}</div></div>`;
                formEl.classList.remove('hidden');
                renderConversations();
                renderMessages();
            }

            formEl.addEventListener('submit', e => {
                e.preventDefault();
                const text = inputEl.value.trim();
                if (!text && !attachInput.files[0]) return;
                const convId = activeConv.id;
                messages[convId] = messages[convId] || [];
                const msg = { id: Date.now(), author_id: currentUser().id, content: text, type: 'text', created_at: new Date().toISOString(), edited_at: null, important: false, status: 'sent' };
                function finalize() {
                    messages[convId].push(msg);
                    saveMessages(convId);
                    activeConv.last_message_at = msg.created_at;
                    saveConversations();
                    inputEl.value = '';
                    attachInput.value = '';
                    renderMessages();
                    setTimeout(() => { msg.status = 'delivered'; saveMessages(convId); renderMessages(); }, 500);
                    setTimeout(() => { msg.status = 'read'; saveMessages(convId); renderMessages(); }, 1000);
                }
                if (attachInput.files[0]) {
                    const reader = new FileReader();
                    reader.onload = e2 => {
                        msg.type = 'attachment';
                        msg.content = e2.target.result;
                        finalize();
                    };
                    reader.readAsDataURL(attachInput.files[0]);
                } else {
                    finalize();
                }
            });

            inputEl.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    formEl.dispatchEvent(new Event('submit'));
                }
            });

            attachBtn.addEventListener('click', () => attachInput.click());

            searchEl.addEventListener('input', () => {
                const term = searchEl.value.toLowerCase();
                Array.from(convListEl.children).forEach(item => {
                    item.classList.toggle('hidden', !item.dataset.name.includes(term));
                });
            });

            async function loadUsers() {
                try {
                    const res = await fetch('C:/Optispar/userdata/nutzer.json');
                    return await res.json();
                } catch (e) {
                    console.warn('nutzer.json nicht gefunden');
                    return [];
                }
            }

            document.getElementById('new-chat-btn').addEventListener('click', async () => {
                if (!users.length) users = await loadUsers();
                renderConversations();   
            });

            renderConversations();
        });
    
(function(){
  function removeLoaderSafely(){
    try{
      ['#loader','#app-loader','.loader','.loading-overlay','.app-overlay']
        .forEach(function(sel){
          document.querySelectorAll(sel).forEach(function(el){
            try{ el.style.display='none'; el.remove(); }catch(_){ try{ el.style.display='none'; }catch(__){} }
          });
        });
      document.documentElement && document.documentElement.classList.remove('loading');
      document.body && document.body.classList.remove('loading');
    }catch(e){ console.warn('[HOTFIX] removeLoaderSafely error', e); }
  }
  window.addEventListener('load', removeLoaderSafely);
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(removeLoaderSafely, 1000); });
  window.addEventListener('error', removeLoaderSafely);
  window.addEventListener('unhandledrejection', removeLoaderSafely);
})();
