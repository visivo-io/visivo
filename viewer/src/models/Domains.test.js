import { emailToSlug } from './Domains';

test('email to slug', async () => {
  expect(emailToSlug('test@gmail.com')).toEqual('test');
  expect(emailToSlug('test@fancycompany.com')).toEqual('fancycompany');
});
