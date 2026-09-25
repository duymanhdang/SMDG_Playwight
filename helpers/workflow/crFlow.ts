import { MyRequestPage, CRHeaderParams } from '../../pages/cr/MyRequestPage';

export async function openCopyRequestAndFillHeader(
  myRequest: MyRequestPage,
  sourceCR: string,
  description: string,
  priority: string = 'Medium',
): Promise<void> {
  await myRequest.goto();
  await myRequest.openCopyRequest(sourceCR, 'Material Number');
  const headerData: CRHeaderParams = {
    description,
    priority,
    notes: `Automated: ${description}`,
  };
  await myRequest.fillHeader(headerData);
  console.log(`[CR] Fill header: description="${description}", priority=${priority}`);
}
