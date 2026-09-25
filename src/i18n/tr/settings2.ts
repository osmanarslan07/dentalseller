/** Clinic settings: currencies, driver messages, roles, transfer companies & drivers. */
export const settings2: Record<string, string> = {
  // currencies
  "Currencies saved ✓": "Para birimleri kaydedildi ✓",
  "Usual currency saved ✓": "Varsayılan para birimi kaydedildi ✓",
  "The main currency is what the clinic reports in — commission, tiers, Accounting and every total. If sellers agree prices in other currencies too, tick them: each patient then has a deal currency, and amounts are converted into the main currency at the rate on the day the price is agreed (payments: the day they come in).":
    "Ana para birimi, kliniğin raporladığı para birimidir — komisyon, kademeler, Muhasebe ve tüm toplamlar. Satış temsilcileri fiyatları başka para birimlerinde de anlaşıyorsa onları işaretleyin: her hastanın bir anlaşma para birimi olur ve tutarlar, fiyatın anlaşıldığı günün kuruyla ana para birimine çevrilir (ödemelerde: ödemenin geldiği gün).",
  "Main currency": "Ana para birimi",
  "Fixed now that the clinic has patients — changing it means converting every amount, which DentalSeller support can do for you.":
    "Klinikte hasta olduğu için artık sabit — değiştirmek tüm tutarların çevrilmesi demektir; bunu DentalSeller destek ekibi sizin için yapabilir.",
  "Market rates below update after saving.": "Aşağıdaki piyasa kurları kaydettikten sonra güncellenir.",
  "Other currencies the clinic deals in": "Kliniğin çalıştığı diğer para birimleri",
  "None ticked = everything in {main}, with no currency choices anywhere in the app.":
    "Hiçbiri işaretli değilse = her şey {main} cinsindendir ve uygulamada para birimi seçimi olmaz.",
  "Market rate": "Piyasa kuru",
  "Our own rate": "Kendi kurumuz",
  "Market rates are the European Central Bank's, updated once a day. Changing a rate here only affects prices agreed and payments recorded from now on — what's already recorded keeps its own rate.":
    "Piyasa kurları Avrupa Merkez Bankası'nındır ve günde bir kez güncellenir. Buradaki bir kuru değiştirmek yalnızca bundan sonra anlaşılan fiyatları ve kaydedilen ödemeleri etkiler — kayıtlı olanlar kendi kurunu korur.",
  "Save currencies": "Para birimlerini kaydet",
  "A seller's new patients and quotes start in this currency — it can still be changed per patient.":
    "Satış temsilcisinin yeni hastaları ve teklifleri bu para birimiyle başlar — hasta bazında yine değiştirilebilir.",
  "Usual currency for {name}": "{name} için varsayılan para birimi",

  // driver messages
  "WhatsApp app": "WhatsApp uygulaması",
  "Clicking WhatsApp opens WhatsApp on this computer or phone with the message filled in — you press send. No setup.":
    "WhatsApp'a tıklamak, mesaj doldurulmuş olarak bu bilgisayarda ya da telefonda WhatsApp'ı açar — gönder'e siz basarsınız. Kurulum gerekmez.",
  "WhatsApp Business API": "WhatsApp Business API",
  "Sent straight from the clinic’s WhatsApp Business number, with delivered / read status on each transfer. Needs the clinic’s Meta details.":
    "Doğrudan kliniğin WhatsApp Business numarasından gönderilir; her transferde iletildi / okundu durumu görünür. Kliniğin Meta bilgileri gerekir.",
  Off: "Kapalı",
  "No WhatsApp buttons. “Copy message” still gives you the text to paste anywhere.":
    "WhatsApp düğmesi yok. “Mesajı kopyala” yine de istediğiniz yere yapıştırmak için metni verir.",
  "{what} copied": "{what} kopyalandı",
  "Driver messages turned off": "Şoför mesajları kapatıldı",
  "Driver messages now use the WhatsApp Business API ✓": "Şoför mesajları artık WhatsApp Business API ile gönderiliyor ✓",
  "Driver messages now use the WhatsApp app ✓": "Şoför mesajları artık WhatsApp uygulamasıyla gönderiliyor ✓",
  "How transfer details reach drivers from a patient’s transfers and the Transfers page. Messages are in Turkish.":
    "Transfer bilgilerinin hastanın transferlerinden ve Transferler sayfasından şoförlere nasıl ulaştığı. Mesajlar Türkçedir.",
  "Only an admin can change this.": "Bunu yalnızca bir yönetici değiştirebilir.",
  "In use": "Kullanımda",
  "Last WhatsApp API problem": "Son WhatsApp API sorunu",
  "Turn driver messages off": "Şoför mesajlarını kapat",
  "Use the WhatsApp app": "WhatsApp uygulamasını kullan",
  "Test message sent — WhatsApp Business API is on ✓": "Test mesajı gönderildi — WhatsApp Business API açık ✓",
  "Connected — last checked {when}.": "Bağlı — son kontrol {when}.",
  "Not set up yet. An admin fills in the clinic’s WhatsApp Business details here.":
    "Henüz kurulmadı. Kliniğin WhatsApp Business bilgilerini bir yönetici buraya girer.",
  "Connected — test message went through {when}. Change anything below and send a new test to update it.":
    "Bağlı — test mesajı {when} tarihinde ulaştı. Güncellemek için aşağıda değişiklik yapıp yeni bir test gönderin.",
  "These details worked on {when}.": "Bu bilgiler {when} tarihinde çalıştı.",
  "Switching…": "Geçiliyor…",
  "Use the API again": "API'yi yeniden kullan",
  "Fill in the clinic’s details from Meta, then send a test message. The API is switched on only once the test message arrives — until then, drivers keep getting messages the current way.":
    "Kliniğin Meta bilgilerini girin, ardından bir test mesajı gönderin. API yalnızca test mesajı ulaştığında açılır — o zamana kadar şoförler mesajları mevcut yöntemle almaya devam eder.",
  "Saved — leave empty to keep it": "Kayıtlı — korumak için boş bırakın",
  "Optional for sending": "Gönderim için isteğe bağlı",
  "Test message failed: {error}": "Test mesajı başarısız: {error}",
  "Sending test…": "Test gönderiliyor…",
  "Save & send test message": "Kaydet ve test mesajı gönder",
  "In the Meta app → WhatsApp → Configuration, set the callback URL and verify token below, then subscribe to the {field} field. Without this, sending still works — transfers just won’t show delivered / read.":
    "Meta uygulaması → WhatsApp → Yapılandırma bölümünde aşağıdaki geri çağırma URL'sini ve doğrulama anahtarını girin, ardından {field} alanına abone olun. Bu olmadan da gönderim çalışır — yalnızca transferlerde iletildi / okundu görünmez.",
  "The verify token appears here after the first save.": "Doğrulama anahtarı ilk kayıttan sonra burada görünür.",
  "This is a local address — Meta can only reach the live site, so set the webhook from the deployed app.":
    "Bu yerel bir adres — Meta yalnızca canlı siteye ulaşabilir; webhook'u yayındaki uygulamadan ayarlayın.",
  "In WhatsApp Manager → Message templates, create both with category {utility} and language {turkish}. Use the names above and paste the text exactly; Meta asks for example values when you submit.":
    "WhatsApp Manager → Mesaj şablonları bölümünde ikisini de {utility} kategorisi ve {turkish} diliyle oluşturun. Yukarıdaki adları kullanın ve metni aynen yapıştırın; gönderirken Meta örnek değerler ister.",
  "Copy text": "Metni kopyala",
  "Examples:": "Örnekler:",
  "Phone number ID": "Telefon numarası ID'si",
  "WhatsApp Manager → Phone numbers, or the Meta app → WhatsApp → API setup. A long number — not the phone number itself.":
    "WhatsApp Manager → Telefon numaraları ya da Meta uygulaması → WhatsApp → API kurulumu. Uzun bir numara — telefon numarasının kendisi değil.",
  "WhatsApp Business Account ID": "WhatsApp Business Hesap ID'si",
  "Optional — useful for support. Also in WhatsApp Manager.": "İsteğe bağlı — destek için faydalı. WhatsApp Manager'da da bulunur.",
  "Access token": "Erişim anahtarı",
  "A permanent token from a System User with whatsapp_business_messaging. Stored encrypted; never shown again.":
    "whatsapp_business_messaging izni olan bir Sistem Kullanıcısından kalıcı anahtar. Şifreli saklanır; bir daha gösterilmez.",
  "App secret": "Uygulama gizli anahtarı",
  "Meta app → App settings → Basic. Needed for delivered / read status. Stored encrypted.":
    "Meta uygulaması → Uygulama ayarları → Temel. İletildi / okundu durumu için gerekir. Şifreli saklanır.",
  "Template: one transfer": "Şablon: tek transfer",
  "Name exactly as approved in WhatsApp Manager.": "Adı, WhatsApp Manager'da onaylandığı şekliyle aynen yazın.",
  "Template: driver’s day list": "Şablon: şoförün günlük listesi",
  "Template language": "Şablon dili",
  "The language the templates were approved in, e.g. tr.": "Şablonların onaylandığı dil, ör. tr.",
  "Send the test message to": "Test mesajının gönderileceği numara",
  "Your own WhatsApp number, with country code.": "Kendi WhatsApp numaranız, ülke koduyla.",
  "Delivery status (webhook)": "İletim durumu (webhook)",
  "Callback URL": "Geri çağırma URL'si",
  "Verify token": "Doğrulama anahtarı",
  "Message templates to submit to Meta": "Meta'ya gönderilecek mesaj şablonları",
  "Template text": "Şablon metni",

  // roles
  "What each role can do. Someone with several roles can do everything any of them allows. Admin always has everything.":
    "Her rolün neler yapabildiği. Birden fazla rolü olan biri, rollerinden herhangi birinin izin verdiği her şeyi yapabilir. Yönetici her zaman her şeye sahiptir.",
  "New role": "Yeni rol",
  "Role saved ✓": "Rol kaydedildi ✓",
  "Role created ✓": "Rol oluşturuldu ✓",
  Permission: "Yetki",
  "1 member": "1 üye",
  "{n} members": "{n} üye",
  Custom: "Özel",
  Changed: "Değiştirildi",
  "Put {role} back to the default permissions?": "{role} varsayılan yetkilere döndürülsün mü?",
  "{role} reset ✓": "{role} sıfırlandı ✓",
  Reset: "Sıfırla",
  "Delete the role {role}?": "{role} rolü silinsin mi?",
  "Role deleted": "Rol silindi",
  "Edit {role}": "{role} düzenle",
  "e.g. Receptionist": "ör. Resepsiyonist",
  "Changes apply to this clinic only. {default} marks what {role} has out of the box; Reset in the table takes it back.":
    "Değişiklikler yalnızca bu klinik için geçerlidir. {default}, {role} rolünün başlangıçta sahip olduklarını gösterir; tablodaki Sıfırla eski haline döndürür.",
  "Save role": "Rolü kaydet",
  "Create role": "Rol oluştur",

  // transfer companies & drivers
  "Transfer companies & drivers": "Transfer firmaları ve şoförler",
  "Add company": "Firma ekle",
  "Pick a company and driver for each transfer. The clinic's own car and drivers are listed as internal — internal transfers never cost anything. Transfer details are sent to the driver's phone.":
    "Her transfer için bir firma ve şoför seçin. Kliniğin kendi aracı ve şoförleri dahili olarak listelenir — dahili transferlerin maliyeti yoktur. Transfer bilgileri şoförün telefonuna gönderilir.",
  internal: "dahili",
  "No default": "Varsayılan yok",
  "No default driver": "Varsayılan şoför yok",
  "Defaults saved ✓": "Varsayılanlar kaydedildi ✓",
  Defaults: "Varsayılanlar",
  "“Suggest transfers” and new transfers start with these — you can still change them on each transfer.":
    "“Transfer öner” ve yeni transferler bunlarla başlar — her transferde yine değiştirebilirsiniz.",
  "Only an admin can change them.": "Bunları yalnızca bir yönetici değiştirebilir.",
  "Airport transfers": "Havalimanı transferleri",
  "Arrival (airport → hotel) and departure (hotel → airport).": "Varış (havalimanı → otel) ve dönüş (otel → havalimanı).",
  "Local transfers": "Yerel transferler",
  "Hotel ↔ clinic.": "Otel ↔ klinik.",
  "Save defaults": "Varsayılanları kaydet",
  "Company saved ✓": "Firma kaydedildi ✓",
  "Company added ✓": "Firma eklendi ✓",
  "Company name": "Firma adı",
  "Phone (dispatch)": "Telefon (operasyon)",
  "Prices, contact person…": "Fiyatlar, iletişim kişisi…",
  Internal: "Dahili",
  External: "Harici",
  "Company deactivated": "Firma devre dışı bırakıldı",
  "Company reactivated": "Firma yeniden etkinleştirildi",
  Deactivate: "Devre dışı bırak",
  Reactivate: "Yeniden etkinleştir",
  "Delete {name} and its drivers? Deactivating keeps them for past transfers.":
    "{name} ve şoförleri silinsin mi? Devre dışı bırakmak onları geçmiş transferler için korur.",
  "Company deleted": "Firma silindi",
  "No drivers yet.": "Henüz şoför yok.",
  "Add driver": "Şoför ekle",
  "Driver saved ✓": "Şoför kaydedildi ✓",
  "Driver added ✓": "Şoför eklendi ✓",
  Vehicle: "Araç",
  inactive: "pasif",
  "no phone": "telefon yok",
  "Driver deactivated": "Şoför devre dışı bırakıldı",
  "Driver reactivated": "Şoför yeniden etkinleştirildi",
  "Delete driver {name}? Deactivating keeps them for past transfers.": "{name} adlı şoför silinsin mi? Devre dışı bırakmak onu geçmiş transferler için korur.",
  "Driver deleted": "Şoför silindi",
};
