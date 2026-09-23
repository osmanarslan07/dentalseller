/** Terms of Service & Data Processing Agreement, in Turkish and English. Versioned: bumping
 * TERMS_VERSION makes every clinic admin accept again on their next visit (when acceptance
 * is enforced). Text in [square brackets] is a placeholder to be completed before clinics
 * are asked to accept — this is a draft for legal review, not legal advice. */

export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE_DATE = "2026-09-23";

/** Off until the text has been reviewed and the [placeholders] filled in: while false,
 * /terms is published but clinic admins aren't stopped to accept it. */
export const REQUIRE_TERMS_ACCEPTANCE = false;

export type TermsLanguage = "tr" | "en";

export interface TermsSection {
  heading: string;
  paragraphs: string[];
}

export interface TermsDocument {
  title: string;
  intro: string;
  sections: TermsSection[];
  acceptLabel: (clinicName: string) => string;
}

export const TERMS: Record<TermsLanguage, TermsDocument> = {
  tr: {
    title: "Hizmet Şartları ve Veri İşleme Sözleşmesi",
    intro:
      "Bu şartlar, DentalSeller hizmetini kullanan klinik ile hizmet sağlayıcı arasındaki ilişkiyi ve klinik adına işlenen kişisel verilerin nasıl korunduğunu düzenler.",
    sections: [
      {
        heading: "1. Taraflar ve kapsam",
        paragraphs: [
          "Bu sözleşme, [DentalSeller hizmetini sunan tüzel kişi / şahıs adı] (“Sağlayıcı”) ile DentalSeller’ı kullanan klinik (“Klinik”) arasında akdedilir. Sözleşme, Klinik adına yetkili bir yönetici (admin) tarafından elektronik olarak kabul edilir.",
          "Bu metnin Türkçe ve İngilizce sürümleri arasında bir uyuşmazlık olması halinde Türkçe sürüm esas alınır.",
        ],
      },
      {
        heading: "2. Hizmet",
        paragraphs: [
          "DentalSeller; hasta süreçleri, teklifler, ziyaretler, görevler, satış ekibi primleri ve bildirimlerin yönetimi için web tabanlı bir yazılım hizmetidir. Bildirimler, Klinik’in tercihine bağlı olarak Telegram üzerinden gönderilebilir.",
        ],
      },
      {
        heading: "3. Veri koruma rolleri",
        paragraphs: [
          "Klinik, hizmete girdiği hasta ve çalışan verileri bakımından 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve uygulanabildiği ölçüde AB/Birleşik Krallık Genel Veri Koruma Tüzüğü (GDPR / UK GDPR) kapsamında veri sorumlusudur. Sağlayıcı, bu verileri yalnızca Klinik adına ve Klinik’in talimatları doğrultusunda işleyen veri işleyendir.",
          "Klinik; verilerin hukuka uygun olarak toplanmasından, ilgili kişilerin aydınlatılmasından, gerekli hallerde açık rızanın alınmasından ve gerekiyorsa VERBİS kaydından sorumludur.",
        ],
      },
      {
        heading: "4. İşleme talimatları ve amaçlar",
        paragraphs: [
          "Klinik, bu sözleşmeyi kabul ederek Sağlayıcı’ya Klinik verilerini yalnızca şu amaçlarla işleme talimatı verir: hizmetin sunulması ve işletilmesi; Klinik veya kullanıcılarının talebi üzerine destek verilmesi; hizmetin bakımı, güvenliği, yedeklenmesi, izlenmesi ve arızaların giderilmesi; yasal yükümlülüklerin yerine getirilmesi.",
          "Sağlayıcı, Klinik verilerini kendi amaçları için kullanmaz; pazarlama, satış, profilleme veya yapay zekâ modellerinin eğitimi amacıyla işlemez ve üçüncü kişilere satmaz.",
        ],
      },
      {
        heading: "5. Destek ve bakım amaçlı erişim",
        paragraphs: [
          "Sağlayıcı’nın yetkilendirilmiş personeli, 4. maddedeki amaçlarla sınırlı olarak ve her erişim için ayrıca önceden bildirim veya onay gerekmeksizin, Klinik hesabına ve verilerine erişebilir; bir sorunun giderilmesi için gerekli olduğu hallerde veriler üzerinde değişiklik yapabilir. Erişim, amaç için gerekli olanla sınırlı tutulur.",
          "Her destek oturumu; erişimi yapan kişi, tarih ve saat, görüntülenen bölümler ve yapılan değişiklikler bakımından bir erişim kaydına işlenir. Destek sırasında yapılan değişiklikler, Klinik’in kayıt geçmişinde “DentalSeller destek” olarak görünür.",
          "Klinik, kendi hesabına ilişkin erişim kayıtlarını her zaman talep edebilir; Sağlayıcı bu kayıtları makul bir süre içinde ([15] gün) iletir. Erişim kayıtları [6] yıl süreyle saklanır.",
        ],
      },
      {
        heading: "6. Gizlilik",
        paragraphs: [
          "Klinik verilerine erişebilen Sağlayıcı personeli, görev süresi sona erdikten sonra da devam eden gizlilik yükümlülüğü altındadır. Erişim yalnızca yetkilendirilmiş kişilere tanınır ve ihtiyaç ortadan kalktığında derhal kaldırılır.",
        ],
      },
      {
        heading: "7. Güvenlik önlemleri",
        paragraphs: [
          "Sağlayıcı, KVKK’nın 12. maddesi ve Kişisel Verileri Koruma Kurulu’nun özel nitelikli kişisel verilere ilişkin kararı dikkate alınarak şu önlemleri uygular: Sağlayıcı erişiminde iki aşamalı kimlik doğrulama; iletimde (TLS) ve barındırma sağlayıcıları tarafından depolamada şifreleme; her kliniğin verisinin veritabanı seviyesindeki erişim kurallarıyla mantıksal olarak ayrılması; en az yetki ilkesi; erişim kayıtlarının tutulması; düzenli yedekleme.",
          "Klinik; kullanıcı hesaplarının yönetiminden, güçlü parolaların kullanılmasından ve ayrılan çalışanların hesaplarının kapatılmasından sorumludur.",
        ],
      },
      {
        heading: "8. Alt işleyenler ve verilerin bulunduğu yer",
        paragraphs: [
          "Sağlayıcı, hizmetin sunulması için şu alt işleyenlerden yararlanır: Supabase (veritabanı, kimlik doğrulama ve dosya depolama; veriler İsveç, Stockholm’deki AB veri merkezinde saklanır); Vercel (uygulama barındırma; İsveç, Stockholm, AB); Telegram (Klinik’in etkinleştirdiği bildirimler).",
          "Kişisel verilerin yurt dışına aktarımı, KVKK’nın 9. maddesinde öngörülen mekanizmalar (ör. standart sözleşme) ve uygulanabildiği ölçüde GDPR’ın V. Bölümü çerçevesinde gerçekleştirilir. Sağlayıcı, alt işleyen değişikliklerini Klinik yöneticilerine en az [30] gün önceden bildirir; Klinik bu değişikliğe itiraz edebilir.",
        ],
      },
      {
        heading: "9. Veri ihlalleri",
        paragraphs: [
          "Sağlayıcı, Klinik verilerini etkileyen bir kişisel veri ihlalini öğrendiğinde Klinik’i gecikmeksizin ve mümkünse [24] saat içinde bilgilendirir ve Klinik’in Kişisel Verileri Koruma Kurulu’na ve ilgili kişilere yapacağı bildirim için gerekli bilgileri sağlar.",
        ],
      },
      {
        heading: "10. İlgili kişi talepleri ve yardım",
        paragraphs: [
          "Sağlayıcı; ilgili kişilerin erişim, düzeltme ve silme gibi taleplerine ve denetim makamlarının sorularına yanıt verilmesinde Klinik’e makul ölçüde yardımcı olur.",
        ],
      },
      {
        heading: "11. Hizmetin sona ermesi ve verilerin silinmesi",
        paragraphs: [
          "Klinik, hizmet süresince verilerini dışa aktarabilir. Hizmetin sona ermesinden sonra Sağlayıcı, yasal saklama yükümlülükleri saklı kalmak kaydıyla Klinik verilerini [90] gün içinde siler. Erişim kayıtları 5. maddedeki süre boyunca saklanır.",
        ],
      },
      {
        heading: "12. Değişiklikler",
        paragraphs: [
          "Sağlayıcı bu şartları güncelleyebilir. Güncellemeler Klinik yöneticilerine uygulama içinde bildirilir ve yeni sürümün kabul edilmesi istenir. Her kabul; sürüm, kabul eden kişi ve tarih ile birlikte kayıt altına alınır.",
        ],
      },
      {
        heading: "13. Uygulanacak hukuk",
        paragraphs: ["Bu sözleşmeye Türk hukuku uygulanır. Uyuşmazlıklarda [şehir] mahkemeleri ve icra daireleri yetkilidir."],
      },
      {
        heading: "14. İletişim",
        paragraphs: ["Bu şartlar ve veri koruma ile ilgili talepler için: [iletişim e-postası]."],
      },
    ],
    acceptLabel: (clinicName) =>
      `Bu şartları okudum ve ${clinicName} adına kabul etme yetkisine sahip olduğumu onaylıyorum.`,
  },

  en: {
    title: "Terms of Service and Data Processing Agreement",
    intro:
      "These terms govern the relationship between a clinic using DentalSeller and its provider, and how personal data processed on the clinic's behalf is protected.",
    sections: [
      {
        heading: "1. Parties and scope",
        paragraphs: [
          "This agreement is between [legal name of the entity or person providing DentalSeller] (the “Provider”) and the clinic using DentalSeller (the “Clinic”). It is accepted electronically on the Clinic's behalf by one of its authorised administrators.",
          "If the Turkish and English versions of this text conflict, the Turkish version prevails.",
        ],
      },
      {
        heading: "2. The service",
        paragraphs: [
          "DentalSeller is web-based software for managing patient pipelines, quotes, visits, tasks, sales-team commission and notifications. Notifications may be sent through Telegram if the Clinic chooses.",
        ],
      },
      {
        heading: "3. Data protection roles",
        paragraphs: [
          "For the patient and staff data it enters into the service, the Clinic is the data controller (veri sorumlusu) under Turkey's Law No. 6698 on the Protection of Personal Data (“KVKK”) and, where applicable, the EU/UK General Data Protection Regulation (GDPR / UK GDPR). The Provider is a processor (veri işleyen) that processes this data only on the Clinic's behalf and on its instructions.",
          "The Clinic is responsible for collecting data lawfully, informing data subjects, obtaining explicit consent where required, and registering with VERBİS where applicable.",
        ],
      },
      {
        heading: "4. Processing instructions and purposes",
        paragraphs: [
          "By accepting this agreement, the Clinic instructs the Provider to process Clinic data only to: provide and operate the service; give support at the request of the Clinic or its users; maintain, secure, back up, monitor and troubleshoot the service; and comply with legal obligations.",
          "The Provider does not use Clinic data for its own purposes: it does not process it for marketing, sale, profiling or training AI models, and does not sell it to third parties.",
        ],
      },
      {
        heading: "5. Support and maintenance access",
        paragraphs: [
          "Authorised Provider personnel may access the Clinic's account and data for the purposes in section 4 without prior notice or separate approval for each access, and may change data where necessary to resolve an issue. Access is limited to what the purpose requires.",
          "Every support session is recorded in an access log: who accessed, when, which areas were viewed and what was changed. Changes made during support appear in the Clinic's history as “DentalSeller support”.",
          "The Clinic may request the access log for its account at any time; the Provider will provide it within a reasonable time ([15] days). Access logs are kept for [6] years.",
        ],
      },
      {
        heading: "6. Confidentiality",
        paragraphs: [
          "Provider personnel with access to Clinic data are bound by confidentiality obligations that continue after their engagement ends. Access is granted only to authorised individuals and removed promptly when no longer needed.",
        ],
      },
      {
        heading: "7. Security measures",
        paragraphs: [
          "Having regard to Article 12 of the KVKK and the Personal Data Protection Board's decision on special categories of personal data, the Provider applies these measures: two-factor authentication for Provider access; encryption in transit (TLS) and at rest by its hosting providers; logical separation of each clinic's data through database-level access rules; least-privilege access; access logging; and regular backups.",
          "The Clinic is responsible for managing its user accounts, using strong passwords and closing the accounts of staff who leave.",
        ],
      },
      {
        heading: "8. Sub-processors and data location",
        paragraphs: [
          "The Provider uses these sub-processors to deliver the service: Supabase (database, authentication and file storage; data is stored in the EU data centre in Stockholm, Sweden); Vercel (application hosting; Stockholm, Sweden, EU); Telegram (notifications the Clinic enables).",
          "Transfers of personal data abroad take place under the mechanisms in Article 9 of the KVKK (such as standard contracts) and, where applicable, Chapter V of the GDPR. The Provider will notify Clinic administrators of changes to sub-processors at least [30] days in advance, and the Clinic may object.",
        ],
      },
      {
        heading: "9. Personal data breaches",
        paragraphs: [
          "If the Provider becomes aware of a personal data breach affecting Clinic data, it will notify the Clinic without undue delay and, where feasible, within [24] hours, and provide the information the Clinic needs to notify the Personal Data Protection Board and data subjects.",
        ],
      },
      {
        heading: "10. Data subject requests and assistance",
        paragraphs: [
          "The Provider will reasonably assist the Clinic in responding to data subject requests (such as access, correction and deletion) and to enquiries from supervisory authorities.",
        ],
      },
      {
        heading: "11. End of service and deletion",
        paragraphs: [
          "The Clinic may export its data while the service is active. After the service ends, the Provider will delete Clinic data within [90] days, except where the law requires it to be kept. Access logs are kept for the period in section 5.",
        ],
      },
      {
        heading: "12. Changes",
        paragraphs: [
          "The Provider may update these terms. Updates are announced to Clinic administrators in the app, and they will be asked to accept the new version. Each acceptance is recorded with the version, the person accepting and the date.",
        ],
      },
      {
        heading: "13. Governing law",
        paragraphs: ["This agreement is governed by Turkish law. The courts and enforcement offices of [city] have jurisdiction over disputes."],
      },
      {
        heading: "14. Contact",
        paragraphs: ["For questions about these terms or data protection: [contact email]."],
      },
    ],
    acceptLabel: (clinicName) =>
      `I have read these terms and confirm I am authorised to accept them on behalf of ${clinicName}.`,
  },
};

export function parseTermsLanguage(value: string | undefined): TermsLanguage {
  return value === "en" ? "en" : "tr";
}
