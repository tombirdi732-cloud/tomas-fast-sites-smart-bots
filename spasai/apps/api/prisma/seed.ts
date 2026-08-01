/**
 * Наполнение локальной БД демо-данными.
 * Запуск: npm run db:seed -w @spasai/api
 *
 * Все суммы — копейки. Все даты пишутся в UTC.
 */
import { BoxStatus, MerchantStatus, PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

/** Сегодня в UTC + смещение в часах. */
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, defaultCommissionRate: 0.2, serviceFee: 2900 },
  });

  const admin = await prisma.user.upsert({
    where: { phone: '+79990000000' },
    update: {},
    create: { phone: '+79990000000', name: 'Админ', role: UserRole.admin },
  });

  const owner = await prisma.user.upsert({
    where: { phone: '+79990000001' },
    update: {},
    create: { phone: '+79990000001', name: 'Ольга (пекарня)', role: UserRole.merchant },
  });

  const customer = await prisma.user.upsert({
    where: { phone: '+79990000002' },
    update: {},
    create: { phone: '+79990000002', name: 'Иван', role: UserRole.customer },
  });

  const bakery = await prisma.merchant.upsert({
    where: { inn: '7701234567' },
    update: {},
    create: {
      ownerUserId: owner.id,
      title: 'Пекарня «Тёплый хлеб»',
      description: 'Свежая выпечка каждый день, вечером — боксы со скидкой.',
      category: 'bakery',
      address: 'Москва, ул. Тверская, 1',
      lat: 55.7601,
      lng: 37.6089,
      phone: '+74950000001',
      inn: '7701234567',
      legalName: 'ООО «Тёплый хлеб»',
      timezone: 'Europe/Moscow',
      status: MerchantStatus.approved,
      commissionRate: 0.2,
    },
  });

  const coffee = await prisma.merchant.upsert({
    where: { inn: '7709876543' },
    update: {},
    create: {
      ownerUserId: owner.id,
      title: 'Кофейня «Полдень»',
      description: 'Сэндвичи и десерты, которые не должны пропасть.',
      category: 'coffee',
      address: 'Москва, ул. Никольская, 10',
      lat: 55.7558,
      lng: 37.6253,
      phone: '+74950000002',
      inn: '7709876543',
      legalName: 'ИП Смирнова О. В.',
      timezone: 'Europe/Moscow',
      status: MerchantStatus.approved,
      commissionRate: 0.18,
    },
  });

  const existingBoxes = await prisma.box.count();
  if (existingBoxes === 0) {
    await prisma.box.createMany({
      data: [
        {
          merchantId: bakery.id,
          title: 'Бокс-сюрприз «Выпечка вечера»',
          description: 'Круассаны, булочки и багет — что осталось к закрытию.',
          originalPrice: 90_000,
          price: 29_900,
          quantityTotal: 8,
          quantityLeft: 8,
          bestBefore: hoursFromNow(20),
          pickupStart: hoursFromNow(6),
          pickupEnd: hoursFromNow(9),
          category: 'bakery',
          allergens: ['глютен', 'молоко'],
          status: BoxStatus.active,
          isRecurring: true,
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=20',
        },
        {
          merchantId: coffee.id,
          title: 'Бокс «Обед на бегу»',
          description: 'Два сэндвича и десерт.',
          originalPrice: 75_000,
          price: 24_900,
          quantityTotal: 5,
          quantityLeft: 5,
          bestBefore: hoursFromNow(16),
          pickupStart: hoursFromNow(3),
          pickupEnd: hoursFromNow(5),
          category: 'coffee',
          allergens: ['глютен', 'яйцо'],
          status: BoxStatus.active,
        },
      ],
    });
  }

  await prisma.favorite.upsert({
    where: { userId_merchantId: { userId: customer.id, merchantId: bakery.id } },
    update: {},
    create: { userId: customer.id, merchantId: bakery.id },
  });

  console.log('Демо-данные готовы:');
  console.log(`  админ      ${admin.phone}`);
  console.log(`  заведение  ${owner.phone}`);
  console.log(`  покупатель ${customer.phone}`);
  console.log(`  боксов     ${await prisma.box.count()}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
