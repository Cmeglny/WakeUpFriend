# WakeUpFriend

Ses kanalındaki bir arkadaşının üzerine gelince çift yönlü ok gösterir. Yayın açıksa ok YAYINDA etiketinin solundadır. Tıklayınca kişiyi en yakın uygun alt ses kanalına taşır, varsayılan 1 saniye sonra geri getirir.

- Üyeleri Taşı, kanalı görme ve bağlanma izinleri gerekir.
- Sahne, AFK, dolu ve erişilemeyen kanallar atlanır; uygun alt oda yoksa ok gösterilmez.
- Kişi başka kanala geçerse veya ayrılırsa geri çekilmez. Kendi satırında ok gösterilmez.
- Bir seferde tek işlem ve kişi başına 3 saniyelik bekleme vardır.
- Başarısız geri dönüşte kırmızı ok yalnızca geri getirmeyi yeniden dener.
- Geri dönüş beklemesi eklenti ayarlarından 500–2500 ms arasında ayarlanabilir.
- Discord kapanırsa devam eden geri getirme tamamlanamayabilir; gerektiğinde normal taşıma menüsünü kullan.

## Kurulum

Bu depo, Vencord için özel bir **userplugin** içerir. Git, Node.js ve pnpm gerekir.

### Vencord kaynak klasörün yoksa

```powershell
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

### Eklentiyi ekle

Vencord kaynak klasöründeyken şu komutları çalıştır:

```powershell
git clone https://github.com/Cmeglny/WakeUpFriend src/userplugins/wakeUpFriend
pnpm build
```

Kaynak derlemesini Discord Desktop'a ilk kez kuruyorsan Discord'u sistem tepsisinden tamamen kapatıp şu komutu çalıştır:

```powershell
pnpm inject
```

Açılan Vencord Installer'da kullandığın Discord kurulumunu seçip kurulumu uygula. Discord'u yeniden aç. Ayarlar → Vencord → Plugins → **WakeUpFriend** bölümünden eklentiyi açıp kapatabilirsin. Mevcut özel kaynak kurulumunda yeniden derleyip Discord'u tamamen kapatıp açmak yeterlidir.

Git kullanmadan eklemek için GitHub'da Code → Download ZIP ile indirip çıkar. `index.ts` doğrudan `Vencord/src/userplugins/wakeUpFriend/index.ts` konumunda olacak şekilde eklenti klasörünü yerleştir; ardından yukarıdaki derleme adımını uygula. Vencord kaynak klasörünü koru.

Resmî rehberler: [Vencord'u kaynaktan kurma](https://docs.vencord.dev/installing/) · [Özel eklenti ekleme](https://docs.vencord.dev/installing/custom-plugins/)

## Güncelleme

Git ile kurduysan Vencord kaynak klasöründen:

```powershell
git -C src/userplugins/wakeUpFriend pull --ff-only
pnpm build
```

Ardından Discord'u tamamen kapatıp aç. ZIP ile kurduysan kaynak dosyalarını yeni sürümle değiştirip yeniden derle.

## Uyumluluk

Kaynaklar Vencord 1.15.14 / `644434941b515a2626a2161e219653cb36e723e7` ile kontrol edildi. Discord'un bileşen yapısı veya Vencord API'leri değişirse uyarlama gerekebilir.

## Lisans

Copyright © 2026 cemuu. **GPL-3.0-or-later**. Lisans metni [LICENSE](LICENSE) dosyasındadır. Bu eklenti bağımsız bir özel eklentidir.
