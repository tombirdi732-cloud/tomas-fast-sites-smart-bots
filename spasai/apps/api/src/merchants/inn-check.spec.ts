import { namesLookAlike } from './inn-check.service';

describe('namesLookAlike — сверка названия с реестром', () => {
  it('не придирается к кавычкам, ОПФ и регистру', () => {
    expect(namesLookAlike('ООО "Тёплый хлеб"', 'ООО «Теплый хлеб»')).toBe(true);
    expect(namesLookAlike('ОБЩЕСТВО ТЕПЛЫЙ ХЛЕБ', 'Тёплый хлеб')).toBe(true);
    expect(namesLookAlike('ИП Смирнова Ольга Владимировна', 'Смирнова Ольга Владимировна')).toBe(
      true,
    );
  });

  it('ловит подстановку чужого названия', () => {
    expect(namesLookAlike('ООО "Тёплый хлеб"', 'ООО "Холодный камень"')).toBe(false);
  });

  it('пустое название не считает совпадением', () => {
    expect(namesLookAlike('ООО', 'ООО')).toBe(false);
  });
});
