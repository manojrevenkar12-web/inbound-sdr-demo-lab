/**
 * POST /services/apexrest/sdr/v1/conversation
 * Called by the demo service after a booking. Unknown fields are rejected, not ignored.
 */
@RestResource(urlMapping='/sdr/v1/conversation')
global with sharing class SdrConversationResource {
    @HttpPost
    global static void upsertConversation() {
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');
        SdrConversationService.Input input;
        try {
            input = (SdrConversationService.Input) JSON.deserializeStrict(
                RestContext.request.requestBody.toString(),
                SdrConversationService.Input.class
            );
        } catch (JSONException e) {
            res.statusCode = 400;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, String>{ 'error' => 'invalid payload' }));
            return;
        }
        try {
            SdrConversationService.Result result = SdrConversationService.apply(input);
            res.statusCode = result.created ? 201 : 200;
            res.responseBody = Blob.valueOf(JSON.serialize(result));
        } catch (SdrConversationService.InvalidInputException e) {
            res.statusCode = 422;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, String>{ 'error' => e.getMessage() }));
        }
    }
}
